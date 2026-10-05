// over 400 lines on purpose: one flat list of sample events
import type { ActivityKind, Prisma, PrismaClient } from '../../generated/prisma/client';
import { seedShips } from './generatedShips';
import { makerById } from './people';
import { daysAgo, recentOrDaysAgo, sumOf } from './shared';
import type { SeedShip } from './ships';

const software = 'seedProgramSoftware';
const hardware = 'seedProgramHardware';
const shipById = (shipId: string) => seedShips.find((ship) => ship.id === shipId)!;
const makerName = (ship: SeedShip) => makerById(ship.makerId)?.name ?? '';
const makerEmail = (ship: SeedShip) => makerById(ship.makerId)?.email ?? '';

interface SeedEvent {
	programId: string;
	kind: ActivityKind;
	actorId?: string;
	submissionId?: string;
	text: string;
	createdAt: Date;
	meta: Prisma.InputJsonObject;
}

function shipEvents(approvedSecondsByShip: Map<string, number>): SeedEvent[] {
	const events: SeedEvent[] = [];
	for (const ship of seedShips) {
		const collaborators = (ship.collaboratorIds ?? []).map(
			(makerId) => makerById(makerId)?.email ?? ''
		);
		const people = collaborators.length ? { collaborators } : {};
		events.push({
			programId: ship.programId,
			kind: 'WEBHOOK',
			submissionId: ship.id,
			text: `Received ${ship.title}`,
			createdAt: recentOrDaysAgo(ship.queuedDaysAgo, ship.queuedHour),
			meta: {
				externalId: `external-${ship.id}`,
				makerEmail: makerEmail(ship),
				journals: ship.devlogs.length,
				evidence: ['commits', 'devlog', 'elapsed'],
				...people
			}
		});
		if (ship.priority) {
			events.push({
				programId: ship.programId,
				kind: 'PRIORITY',
				submissionId: ship.id,
				text: `Priority review requested for ${ship.title}`,
				createdAt: daysAgo(Math.max(ship.queuedDaysAgo - 1, 0), 12),
				meta: { email: makerEmail(ship), title: ship.title }
			});
		}
		if (!ship.review) continue;
		const held = ship.status === 'secondpass';
		events.push({
			programId: ship.programId,
			kind: ship.review.decision.toUpperCase() as ActivityKind,
			actorId: ship.review.reviewerId,
			submissionId: ship.id,
			text: `${ship.review.decision} ${ship.title}`,
			createdAt: recentOrDaysAgo(ship.review.daysAgo, ship.review.hourOfDay),
			meta: {
				decision: ship.review.decision,
				...(held ? { secondPass: 'pending' } : {}),
				approvedSeconds: approvedSecondsByShip.get(ship.id) ?? 0,
				breakdownSeconds: {
					hackatime: sumOf(ship.commits.map((commit) => commit.codingSeconds)),
					journals: sumOf(ship.devlogs.map((devlog) => devlog.seconds)),
					lapse: sumOf(ship.clips.map((clip) => clip.lengthSeconds))
				},
				title: ship.title,
				maker: makerName(ship),
				...people,
				hasNote: true,
				hasAudit: true
			}
		});
	}
	return events;
}

function secondPassEvent(
	shipId: string,
	actorId: string,
	operation: 'second-pass-confirmed' | 'second-pass-overridden',
	approvedSecondsByShip: Map<string, number>
): SeedEvent {
	const ship = shipById(shipId);
	const review = ship.review!;
	return {
		programId: ship.programId,
		kind: review.decision.toUpperCase() as ActivityKind,
		actorId,
		submissionId: ship.id,
		text: `${operation === 'second-pass-confirmed' ? 'confirmed' : 'overrode'} ${ship.title}`,
		// an hour after the reviewer's own decision: 60 * 60 * 1000
		createdAt: new Date(recentOrDaysAgo(review.daysAgo, review.hourOfDay).getTime() + 3600000),
		meta: {
			op: operation,
			decision: review.decision,
			...(operation === 'second-pass-overridden' ? { from: 'approved' } : {}),
			approvedSeconds: approvedSecondsByShip.get(ship.id) ?? 0,
			title: ship.title,
			maker: makerName(ship),
			hasNote: true,
			hasAudit: true
		}
	};
}

function programEvents(): SeedEvent[] {
	const reverted = shipById('seedShipDecided07');
	const withdrawn = shipById('seedShipDecided08');
	const edited = shipById('seedShipPending06');
	const failing = shipById('seedShipPending12');
	const outboundUrl = 'https://example.test/webhook';
	return [
		{
			programId: software,
			kind: 'SETTINGS',
			actorId: 'seedUserAdmin',
			text: 'Created Program 1',
			createdAt: daysAgo(30, 9),
			meta: {
				event: 'program_created',
				name: 'Program 1',
				accepts: ['commits', 'devlog', 'elapsed'],
				organizers: ['user2@example.com']
			}
		},
		{
			programId: software,
			kind: 'SETTINGS',
			actorId: 'seedUserPoc',
			text: 'Updated settings',
			createdAt: daysAgo(26, 10),
			meta: {
				changed: ['name', 'accepted evidence', 'delivery'],
				diff: {
					name: { from: 'Program 0', to: 'Program 1' },
					evidence: { from: ['commits'], to: ['commits', 'devlog', 'elapsed'] },
					flags: [{ kind: 'NO_README', from: false, to: true }],
					outUrl: { from: null, to: outboundUrl },
					outEnabled: { from: false, to: true }
				}
			}
		},
		{
			programId: software,
			kind: 'SETTINGS',
			actorId: 'seedUserPoc',
			text: 'Added a checklist item',
			createdAt: daysAgo(25, 11),
			meta: { sub: 'checklist', label: 'Checklist item 2' }
		},
		{
			programId: hardware,
			kind: 'SETTINGS',
			actorId: 'seedUserPoc',
			text: 'Added a review field',
			createdAt: daysAgo(25, 12),
			meta: { sub: 'reviewField', label: 'Field 1', type: 'select' }
		},
		{
			programId: 'seedProgramArchived',
			kind: 'SETTINGS',
			actorId: 'seedUserAdmin',
			text: 'Archived Program 3',
			createdAt: daysAgo(40, 9),
			meta: { sub: 'status', from: 'ACTIVE', to: 'ARCHIVED' }
		},
		{
			programId: software,
			kind: 'SECRET',
			actorId: 'seedUserPoc',
			text: 'Rotated the ingest signing secret',
			createdAt: daysAgo(24, 9),
			meta: { scope: 'ingest', last4: 'a1b2' }
		},
		{
			programId: software,
			kind: 'SECRET',
			actorId: 'seedUserPoc',
			text: 'Rotated the outbound signing secret',
			createdAt: daysAgo(24, 10),
			meta: { scope: 'outbound', last4: 'k3y9' }
		},
		{
			programId: software,
			kind: 'MEMBER',
			actorId: 'seedUserPoc',
			text: 'Added user3@example.com as Reviewer',
			createdAt: daysAgo(23, 9),
			meta: { op: 'added', email: 'user3@example.com', role: 'Reviewer' }
		},
		{
			programId: software,
			kind: 'MEMBER',
			actorId: 'seedUserPoc',
			text: 'Set user5@example.com to 3 permissions',
			createdAt: daysAgo(22, 9),
			meta: {
				op: 'permissions-changed',
				email: 'user5@example.com',
				from: [],
				to: ['SECOND_PASS', 'VIEW_AUDIT_LOG', 'VIEW_REVIEWERS'],
				fromRole: 'Reviewer',
				toRole: 'Reviewer + 3 permissions'
			}
		},
		{
			programId: software,
			kind: 'MEMBER',
			actorId: 'seedUserPoc',
			text: 'Set user5@example.com tracks to software + hardware',
			createdAt: daysAgo(22, 10),
			meta: {
				op: 'tracks-changed',
				email: 'user5@example.com',
				from: ['software'],
				to: ['software', 'hardware']
			}
		},
		{
			programId: software,
			kind: 'MEMBER',
			actorId: 'seedUserPoc',
			text: 'Invited invite1@example.com',
			createdAt: daysAgo(2, 9),
			meta: { op: 'invited', email: 'invite1@example.com', role: 'Reviewer' }
		},
		{
			programId: hardware,
			kind: 'MEMBER',
			actorId: 'seedUserAdmin',
			text: 'Added user4@example.com as Reviewer',
			createdAt: daysAgo(23, 10),
			meta: { op: 'added', email: 'user4@example.com', role: 'Reviewer' }
		},
		{
			programId: reverted.programId,
			kind: 'REVERT',
			actorId: 'seedUserPoc',
			submissionId: reverted.id,
			text: `Reverted ${reverted.title}`,
			createdAt: daysAgo(6, 13),
			meta: {
				fromStatus: 'approved',
				toStatus: 'reverted',
				title: reverted.title,
				maker: makerName(reverted),
				auditReason: 'audit reason 1.',
				hasPublicMessage: true
			}
		},
		{
			programId: withdrawn.programId,
			kind: 'WEBHOOK',
			submissionId: withdrawn.id,
			text: `Withdrawn ${withdrawn.title}`,
			createdAt: daysAgo(9, 16),
			meta: {
				op: 'withdrawn',
				externalId: `external-${withdrawn.id}`,
				makerEmail: makerEmail(withdrawn)
			}
		},
		{
			programId: edited.programId,
			kind: 'SHIP_EDIT',
			actorId: 'seedUserPoc',
			submissionId: edited.id,
			text: `Edited ${edited.title}`,
			createdAt: daysAgo(13, 14),
			meta: {
				changes: [
					{ field: 'title', label: 'Title', from: 'Project 0', to: edited.title },
					{ field: 'track', label: 'Track', from: 'hardware', to: 'software' }
				]
			}
		},
		{
			programId: software,
			kind: 'FLAG',
			actorId: 'seedUserPoc',
			submissionId: 'seedShipPending11',
			text: 'Dismissed a flag',
			createdAt: daysAgo(8, 15),
			meta: { op: 'dismissed', flagId: 'seedFlagDismissed' }
		},
		{
			programId: failing.programId,
			kind: 'EVIDENCE',
			submissionId: failing.id,
			text: `Evidence capture failed for ${failing.title}`,
			createdAt: daysAgo(9, 16),
			meta: {
				source: 'capture',
				attempt: 2,
				error: 'repository clone timed out',
				notes: ['repository clone timed out', 'retry scheduled']
			}
		},
		{
			programId: hardware,
			kind: 'EVIDENCE',
			submissionId: 'seedShipPending23',
			text: 'Evidence capture gave up',
			createdAt: daysAgo(13, 18),
			meta: { source: 'capture', attempt: 5, error: 'repository not found', exhausted: true }
		},
		{
			programId: software,
			kind: 'VM',
			actorId: 'seedUserSoftware',
			submissionId: 'seedShipDecided11',
			text: 'Launched a review VM',
			createdAt: daysAgo(2, 8),
			meta: { op: 'launch', type: 'linux', vmid: 4101 }
		},
		{
			programId: software,
			kind: 'VM',
			actorId: 'seedUserSoftware',
			submissionId: 'seedShipDecided11',
			text: 'Deleted a review VM',
			createdAt: daysAgo(2, 9),
			meta: { op: 'delete', type: 'linux', vmid: 4101 }
		},
		{
			programId: software,
			kind: 'VM',
			submissionId: 'seedShipDecided06',
			text: 'Idle VM auto-deleted',
			createdAt: daysAgo(9, 17),
			meta: { op: 'reap', type: 'windows', vmid: 4087 }
		},
		{
			programId: software,
			kind: 'DELIVERY',
			submissionId: 'seedShipDecided12',
			text: 'Delivered review.approved',
			createdAt: daysAgo(1, 14),
			meta: {
				event: 'review.approved',
				status: 'DELIVERED',
				httpStatus: 200,
				attempts: 1,
				url: outboundUrl
			}
		},
		{
			programId: software,
			kind: 'DELIVERY',
			submissionId: 'seedShipDecided13',
			text: 'Retrying review.rejected',
			createdAt: daysAgo(1, 16),
			meta: {
				event: 'review.rejected',
				status: 'RETRYING',
				httpStatus: 503,
				attempts: 2,
				errorDetail: 'upstream unavailable',
				url: outboundUrl
			}
		},
		{
			programId: software,
			kind: 'DELIVERY',
			submissionId: 'seedShipDecided10',
			text: 'Failed review.changes',
			createdAt: daysAgo(4, 19),
			meta: {
				event: 'review.changes',
				status: 'FAILED',
				httpStatus: 500,
				attempts: 8,
				errorDetail: 'receiver returned an error',
				url: outboundUrl
			}
		}
	];
}

export async function seedActivity(db: PrismaClient, approvedSecondsByShip: Map<string, number>) {
	const events = [
		...shipEvents(approvedSecondsByShip),
		secondPassEvent(
			'seedShipDecided02',
			'seedUserPoc',
			'second-pass-confirmed',
			approvedSecondsByShip
		),
		secondPassEvent(
			'seedShipDecided09',
			'seedUserAdmin',
			'second-pass-confirmed',
			approvedSecondsByShip
		),
		secondPassEvent(
			'seedShipDecided12',
			'seedUserPoc',
			'second-pass-confirmed',
			approvedSecondsByShip
		),
		secondPassEvent(
			'seedShipDecided13',
			'seedUserPoc',
			'second-pass-overridden',
			approvedSecondsByShip
		),
		...programEvents()
	];
	await db.activityEvent.createMany({
		data: events.map((event, index) => ({ id: `seedEvent${index}`, ...event }))
	});
}
