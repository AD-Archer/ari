import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { privateProvider } from '$private';
import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { imageUploadsConfigured } from '$lib/server/imageUpload';
import { ago } from '$lib/server/serialize';
import { channelStatus } from '$lib/server/slackChannels';
import { webhooksBaseUrl } from '$lib/server/webhooks';
import type { SettingsValues, ToolsDraft } from '$lib/settingsRules';
import { activeIngestSecret, maskSecret } from './secrets';

const inboundStatusLabel = {
	ACCEPTED: 'Accepted',
	DUPLICATE: 'Duplicate',
	CONFLICT: 'Already queued',
	BAD_SIGNATURE: 'Bad signature',
	INVALID: 'Invalid'
} as const;

const outboundStatusLabel = {
	PENDING: 'Pending',
	DELIVERED: 'Delivered',
	FAILED: 'Failed'
} as const;

export async function loadSettings(programId: string, user: App.SessionUser, origin: string) {
	const [program, ingestSecret, outbound, deliveries, outboundDeliveries, privateSettings] =
		await Promise.all([
			db.program.findUnique({
				where: { id: programId },
				include: {
					checklist: { orderBy: { order: 'asc' } },
					reviewFields: { orderBy: { order: 'asc' } },
					snippets: { orderBy: { name: 'asc' } }
				}
			}),
			activeIngestSecret(programId),
			db.outboundEndpoint.findUnique({ where: { programId } }),
			// the 12 latest of each log
			db.webhookDelivery.findMany({
				where: { programId },
				orderBy: { receivedAt: 'desc' },
				take: 12
			}),
			db.outboundDelivery.findMany({
				where: { programId },
				orderBy: { createdAt: 'desc' },
				take: 12
			}),
			privateProvider.settingsLoad(programId)
		]);
	if (!program) throw error(404, 'Program not found');

	const settings: SettingsValues = {
		displayName: program.name,
		iconUrl: program.iconUrl ?? '',
		cardBgUrl: program.cardBgUrl ?? '',
		trackingStartsAt: program.trackingStartsAt?.toISOString().slice(0, 10) ?? '',
		accepts: {
			commits: program.accepts.includes('commits'),
			elapsed: program.accepts.includes('elapsed'),
			devlog: program.accepts.includes('devlog')
		},
		collaborative: program.collaborative,
		secondPass: program.secondPass,
		secondPassApproved: program.secondPassApproved,
		secondPassChanges: program.secondPassChanges,
		secondPassRejected: program.secondPassRejected,
		secondPassOrganizerBypass: program.secondPassOrganizerBypass,
		screenIdentity: program.screenIdentity,
		screenHackatime: program.screenHackatime,
		reviewersCannotReviewOwnProjects: program.reviewersCannotReviewOwnProjects,
		allowDeflation: program.allowDeflation,
		hoursJustification: program.hoursJustification,
		reviewerReauth: program.reviewerReauth,
		reviewerReauthTtlMinutes: String(program.reviewerReauthTtlMinutes),
		priorityReview: program.priorityReview,
		priorityReviewMessage: program.priorityReviewMessage ?? '',
		reviewGoal: String(program.weeklyReviewGoal),
		reviewersChannel: program.reviewersChannelId ?? '',
		outUrl: outbound?.url ?? '',
		outEnabled: outbound?.enabled ?? true
	};

	const tools: ToolsDraft = {
		checklist: program.checklist.map((item) => ({
			id: item.id,
			label: item.label,
			tracks: item.tracks
		})),
		fields: program.reviewFields.map((field) => ({
			id: field.id,
			type: field.type,
			label: field.label,
			description: field.description,
			key: field.key,
			options: field.options,
			required: field.required,
			tracks: field.tracks
		})),
		snippets: program.snippets.map((snippet) => ({
			id: snippet.id,
			name: snippet.name,
			body: snippet.body
		}))
	};

	const ingestBase = webhooksBaseUrl();
	const appBase = (env.BASE_URL?.trim() || origin).replace(/\/$/, '');

	return {
		settings,
		tools,
		privateSettings,
		status: program.status,
		canDisableJustification: hasOrgPermission(user, 'MANAGE_PROGRAMS'),
		uploadsConfigured: imageUploadsConfigured(),
		priorityFormUrl: program.priorityReviewToken
			? `${appBase}/priority/${program.priorityReviewToken}`
			: null,
		// streamed: a slack round-trip should not hold up the page
		reviewersChannelStatus: program.reviewersChannelId
			? channelStatus(program.reviewersChannelId)
			: Promise.resolve(null),
		webhook: {
			endpoint: ingestBase ? `${ingestBase}/api/ingest/${programId}` : null,
			inSecretMasked: ingestSecret ? maskSecret(ingestSecret.last4) : null,
			outSecretMasked: outbound?.last4 ? maskSecret(outbound.last4) : null,
			deliveries: deliveries.map((delivery) => ({
				id: delivery.id,
				status: inboundStatusLabel[delivery.status],
				httpStatus: delivery.httpStatus,
				ok: delivery.httpStatus < 400,
				externalId: delivery.externalId,
				when: ago(delivery.receivedAt)
			})),
			outboundDeliveries: outboundDeliveries.map((delivery) => ({
				id: delivery.id,
				event: delivery.event,
				status: outboundStatusLabel[delivery.status],
				httpStatus: delivery.httpStatus,
				ok: delivery.status === 'DELIVERED',
				when: ago(delivery.createdAt)
			}))
		}
	};
}
