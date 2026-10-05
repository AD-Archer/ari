import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client';
import { seedShips } from './generatedShips';
import { daysAgo, minutesAgo, recentOrDaysAgo } from './shared';
import { projectSlug } from './ships';

const software = 'seedProgramSoftware';
const hardware = 'seedProgramHardware';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const shipById = (shipId: string) => seedShips.find((ship) => ship.id === shipId)!;

export const liveClaims = [
	['seedShipPending15', 'seedUserSoftware'],
	['seedShipPending17', 'seedUserLead'],
	['seedShipPending29', 'seedUserHardware']
] as const;

// claimed now, so each lasts the full claim ttl from the moment this runs
export async function renewLiveClaims(db: PrismaClient): Promise<number> {
	let renewed = 0;
	for (const [submissionId, claimedById] of liveClaims) {
		const updated = await db.submission.updateMany({
			where: { id: submissionId, status: 'pending' },
			data: { claimedById, claimedAt: new Date() }
		});
		renewed += updated.count;
	}
	return renewed;
}

// each open ends at its ship's decision so the pairing in sessions.ts finds it
export async function seedSessions(db: PrismaClient) {
	const decidedOpen = (shipId: string, minutesBefore: number) => {
		const ship = shipById(shipId);
		const review = ship.review!;
		const decidedAt = recentOrDaysAgo(review.daysAgo, review.hourOfDay);
		return {
			submissionId: shipId,
			reviewerId: review.reviewerId,
			openedAt: new Date(decidedAt.getTime() - minutesBefore * 60000), // ms in a minute: 60 * 1000
			closedAt: decidedAt,
			closeReason: 'decided'
		};
	};
	const opens = [
		decidedOpen('seedShipDecided11', 22),
		{
			submissionId: 'seedShipPending17',
			reviewerId: 'seedUserSoftware',
			openedAt: daysAgo(2, 9),
			closedAt: new Date(daysAgo(2, 9).getTime() + 840000), // 14m: 14 * 60 * 1000
			closeReason: 'left'
		},
		decidedOpen('seedShipHeldChanges', 17),
		decidedOpen('seedShipDecided12', 26),
		decidedOpen('seedShipDecided13', 12),
		{
			submissionId: 'seedShipPending19',
			reviewerId: 'seedUserSoftware',
			openedAt: daysAgo(1, 16),
			closedAt: new Date(daysAgo(1, 16).getTime() + 2400000), // 40m: 40 * 60 * 1000
			closeReason: 'idle'
		},
		decidedOpen('seedShipHeld', 31),
		decidedOpen('seedShipDecided14', 18),
		decidedOpen('seedShipHeldRejected', 9),
		decidedOpen('seedShipDecided19', 25),
		decidedOpen('seedShipDecided18', 35),
		decidedOpen('seedShipDecided17', 20),
		// still open: paired with the live claims below
		{
			submissionId: 'seedShipPending15',
			reviewerId: 'seedUserSoftware',
			openedAt: minutesAgo(6),
			closedAt: null,
			closeReason: null
		},
		{
			submissionId: 'seedShipPending29',
			reviewerId: 'seedUserHardware',
			openedAt: minutesAgo(4),
			closedAt: null,
			closeReason: null
		},
		{
			submissionId: 'seedShipPending17',
			reviewerId: 'seedUserLead',
			openedAt: minutesAgo(2),
			closedAt: null,
			closeReason: null
		}
	];
	await db.submissionOpen.createMany({
		data: opens.map((open, index) => ({ id: `seedOpen${index}`, ...open }))
	});
	await renewLiveClaims(db);
	// 3h old: a claim past its ttl, which anyone may take over
	await db.submission.update({
		where: { id: 'seedShipPending16' },
		data: { claimedById: 'seedUserLead', claimedAt: minutesAgo(180) }
	});
}

export async function seedFlags(db: PrismaClient) {
	await db.flag.createMany({
		data: [
			{
				id: 'seedFlagReadme',
				submissionId: 'seedShipPending04',
				kind: 'NO_README',
				severity: 'WARN',
				title: 'Flag 1',
				what: 'Description of flag 1.',
				matched: [
					{
						key: 'Key 1',
						value: `https://example.com/${projectSlug(shipById('seedShipPending04').title)}`
					}
				],
				action: 'Action for flag 1.'
			},
			{
				id: 'seedFlagReuse',
				submissionId: 'seedShipPending09',
				kind: 'HOURS_REUSE',
				severity: 'DANGER',
				title: 'Flag 2',
				what: 'Description of flag 2.',
				matched: [{ key: 'Key 2', value: 'seedShipDecided01' }],
				action: 'Action for flag 2.'
			},
			{
				id: 'seedFlagMarathon',
				submissionId: 'seedShipPending13',
				kind: 'MARATHON_SESSION',
				severity: 'WARN',
				title: 'Flag 3',
				what: 'Description of flag 3.',
				matched: [{ key: 'Key 3', value: '11h 4m' }],
				action: 'Action for flag 3.'
			},
			{
				id: 'seedFlagDismissed',
				submissionId: 'seedShipPending11',
				kind: 'IDLE_DEVLOG',
				severity: 'WARN',
				title: 'Flag 4',
				what: 'Description of flag 4.',
				matched: [{ key: 'Key 4', value: '2' }],
				action: 'Action for flag 4.',
				dismissedAt: daysAgo(8, 15),
				dismissedById: 'seedUserPoc'
			},
			{
				id: 'seedFlagPhantom',
				submissionId: 'seedShipPending11',
				kind: 'PHANTOM_FILES',
				severity: 'WARN',
				title: 'Flag 5',
				what: 'Description of flag 5.',
				matched: [{ key: 'Key 5', value: 'src/file1.ts' }],
				action: 'Action for flag 5.'
			},
			{
				id: 'seedFlagDoubleDip',
				submissionId: 'seedShipPending22',
				kind: 'DOUBLE_DIP',
				severity: 'DANGER',
				title: 'Flag 6',
				what: 'Description of flag 6.',
				matched: [{ key: 'Key 6', value: 'Program 1' }],
				action: 'Action for flag 6.'
			},
			{
				id: 'seedFlagPlagiarism',
				submissionId: 'seedShipPending26',
				kind: 'PLAGIARISM',
				severity: 'DANGER',
				title: 'Flag 7',
				what: 'Description of flag 7.',
				matched: [{ key: 'Key 7', value: 'https://example.com/project0' }],
				action: 'Action for flag 7.'
			}
		]
	});
	await db.flagRule.createMany({
		data: [
			{ id: 'seedFlagRuleA', programId: software, kind: 'NO_README', enabled: true },
			{ id: 'seedFlagRuleB', programId: software, kind: 'HOURS_REUSE', enabled: true },
			{ id: 'seedFlagRuleC', programId: software, kind: 'MARATHON_SESSION', enabled: false },
			{ id: 'seedFlagRuleD', programId: hardware, kind: 'DOUBLE_DIP', enabled: true },
			{ id: 'seedFlagRuleE', programId: hardware, kind: 'PLAGIARISM', enabled: true }
		]
	});
}

export async function seedDeliveries(db: PrismaClient) {
	const inbound = [
		{
			programId: software,
			shipId: 'seedShipPending20',
			status: 'ACCEPTED',
			httpStatus: 200,
			at: minutesAgo(40)
		},
		{
			programId: software,
			shipId: 'seedShipPending19',
			status: 'ACCEPTED',
			httpStatus: 200,
			at: daysAgo(1)
		},
		{
			programId: software,
			shipId: 'seedShipPending19',
			status: 'DUPLICATE',
			httpStatus: 200,
			at: daysAgo(1, 16)
		},
		{
			programId: software,
			status: 'BAD_SIGNATURE',
			httpStatus: 401,
			at: daysAgo(3, 7),
			errorDetail: 'signature mismatch'
		},
		{
			programId: software,
			status: 'INVALID',
			httpStatus: 422,
			at: daysAgo(5, 11),
			errorDetail: 'repoUrl: required'
		},
		{
			programId: software,
			shipId: 'seedShipPending14',
			status: 'CONFLICT',
			httpStatus: 409,
			at: daysAgo(7, 12),
			errorDetail: 'ship is being reviewed'
		},
		{
			programId: hardware,
			shipId: 'seedShipPending30',
			status: 'ACCEPTED',
			httpStatus: 200,
			at: minutesAgo(60)
		},
		{
			programId: hardware,
			shipId: 'seedShipPending29',
			status: 'ACCEPTED',
			httpStatus: 200,
			at: daysAgo(2, 20)
		},
		{
			programId: hardware,
			status: 'INVALID',
			httpStatus: 422,
			at: daysAgo(4, 9),
			errorDetail: 'title: required'
		}
	] as const;
	await db.webhookDelivery.createMany({
		data: inbound.map((delivery, index) => ({
			id: `seedWebhookDelivery${index}`,
			programId: delivery.programId,
			externalId: 'shipId' in delivery ? `external-${delivery.shipId}` : null,
			submissionId: 'shipId' in delivery && delivery.status === 'ACCEPTED' ? delivery.shipId : null,
			status: delivery.status,
			httpStatus: delivery.httpStatus,
			payloadBytes: 1840 + index * 173, // sample body sizes
			rawBodySha256: sha256(`seed delivery ${index}`),
			errorDetail: 'errorDetail' in delivery ? delivery.errorDetail : null,
			receivedAt: delivery.at
		}))
	});

	// a reserved tld: an enabled endpoint is posted to for real, so it must never resolve
	const url = 'https://example.test/webhook';
	await db.outboundEndpoint.create({
		data: { id: 'seedOutboundEndpoint', programId: software, url, enabled: true, last4: 'k3y9' }
	});
	const payloadFor = (event: string, shipId: string) =>
		JSON.stringify({ event, submission: { id: shipId, externalId: `external-${shipId}` } });
	await db.outboundDelivery.createMany({
		data: [
			{
				id: 'seedOutboundDelivered',
				programId: software,
				event: 'review.approved',
				submissionId: 'seedShipDecided12',
				url,
				status: 'DELIVERED',
				attempts: 1,
				httpStatus: 200,
				payload: payloadFor('review.approved', 'seedShipDecided12'),
				createdAt: daysAgo(1, 14),
				deliveredAt: daysAgo(1, 14)
			},
			{
				id: 'seedOutboundDeliveredOlder',
				programId: software,
				event: 'review.approved',
				submissionId: 'seedShipDecided06',
				url,
				status: 'DELIVERED',
				attempts: 2,
				httpStatus: 200,
				payload: payloadFor('review.approved', 'seedShipDecided06'),
				createdAt: daysAgo(9, 15),
				deliveredAt: daysAgo(9, 16)
			},
			{
				id: 'seedOutboundPending',
				programId: software,
				event: 'review.rejected',
				submissionId: 'seedShipDecided13',
				url,
				status: 'PENDING',
				attempts: 2,
				httpStatus: 503,
				errorDetail: 'upstream unavailable',
				payload: payloadFor('review.rejected', 'seedShipDecided13'),
				createdAt: daysAgo(1, 16)
			},
			{
				id: 'seedOutboundFailed',
				programId: software,
				event: 'review.changes',
				submissionId: 'seedShipDecided10',
				url,
				status: 'FAILED',
				attempts: 8,
				httpStatus: 500,
				errorDetail: 'receiver returned an error',
				payload: payloadFor('review.changes', 'seedShipDecided10'),
				createdAt: daysAgo(4, 18)
			}
		]
	});
}

export async function seedAccess(db: PrismaClient) {
	await db.invite.createMany({
		data: [
			{
				id: 'seedInviteReviewer',
				email: 'invite1@example.com',
				programId: software,
				tracks: ['software'],
				createdAt: daysAgo(2, 9)
			},
			{
				id: 'seedInviteOrganizer',
				email: 'invite2@example.com',
				orgPermissions: ['VIEW_ALL_PROGRAMS'],
				programId: hardware,
				permissions: ['VIEW_REVIEWERS', 'VIEW_AUDIT_LOG'],
				tracks: ['software', 'hardware'],
				createdAt: daysAgo(1, 10)
			}
		]
	});
	await db.reviewerNote.create({
		data: {
			id: 'seedReviewerNote',
			subjectId: 'seedUserSoftware',
			authorId: 'seedUserPoc',
			body: 'reviewer note 1.',
			createdAt: daysAgo(5, 12)
		}
	});
	// the raw value is thrown away: only its hash and last four characters are kept
	const rawToken = `ari_mcp_${randomBytes(32).toString('base64url')}`;
	await db.mcpToken.create({
		data: {
			id: 'seedMcpToken',
			tokenHash: sha256(rawToken),
			userId: 'seedUserAdmin',
			label: 'Token 1',
			last4: rawToken.slice(-4),
			createdAt: daysAgo(12, 9),
			lastUsedAt: daysAgo(1, 9)
		}
	});
}
