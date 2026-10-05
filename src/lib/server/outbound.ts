import { db } from '$lib/server/db';
import { decrypt } from '$lib/server/crypto';
import { isSafeOutboundUrl } from '$lib/server/outboundSigning';
import { buildRedispatchInput } from '$lib/server/outboundRedispatch';
import {
	buildReviewPayload,
	buildShipUpdatedPayload,
	type DispatchInput,
	type ShipEditChange,
	type buildShipSnapshot
} from '$lib/server/outboundPayload';

export { isSafeOutboundUrl, originOf } from '$lib/server/outboundSigning';
export { outboundEvent, buildShipSnapshot } from '$lib/server/outboundPayload';
export type { ShipEditChange, DispatchInput } from '$lib/server/outboundPayload';

// best-effort: ari-webhooks also polls, so a lost notify only delays the delivery
export async function notifyDelivery(deliveryId: string): Promise<void> {
	await db.$executeRaw`select pg_notify('outboundDeliveryPending', ${deliveryId})`.catch((error) =>
		console.warn(`[outbound] notify failed for ${deliveryId}:`, error)
	);
}

// never throws: runs inside dispatch catch paths, and a missed event must stay visible
async function logQueueFailure(
	programId: string,
	submissionId: string,
	event: string,
	error: unknown
): Promise<void> {
	console.error(`[outbound] failed to queue ${event} for ${submissionId}:`, error);
	await db.activityEvent
		.create({
			data: {
				programId,
				kind: 'DELIVERY',
				submissionId,
				text: `Webhook could not be queued · ${event}`,
				meta: {
					event,
					status: 'QUEUE_FAILED',
					errorDetail: error instanceof Error ? error.message : String(error)
				}
			}
		})
		.catch((auditError) =>
			console.error('[outbound] queue-failure audit write failed:', auditError)
		);
}

// queued is the only outcome that wrote a delivery row
export type DispatchOutcome =
	| 'queued'
	| 'noEndpoint'
	| 'notSigned'
	| 'blockedUrl'
	| 'noDecision'
	| 'failed';

type SigningEndpoint = { url: string; secretEnc: string };

// an unsafe url on a live endpoint is a missed event, so it is recorded; an unconfigured one is not
async function usableEndpoint(
	endpoint: { enabled: boolean; url: string | null; secretEnc: string | null } | null,
	programId: string,
	submissionId: string,
	event: string
): Promise<SigningEndpoint | DispatchOutcome> {
	if (!endpoint || !endpoint.enabled || !endpoint.url) return 'noEndpoint';
	if (!endpoint.secretEnc) return 'notSigned';
	if (!isSafeOutboundUrl(endpoint.url)) {
		await logQueueFailure(
			programId,
			submissionId,
			event,
			new Error('destination URL is not allowed')
		);
		return 'blockedUrl';
	}
	return { url: endpoint.url, secretEnc: endpoint.secretEnc };
}

async function queuePayload(
	endpoint: SigningEndpoint,
	programId: string,
	submissionId: string,
	event: string,
	payload: unknown
): Promise<void> {
	// decrypt before creating the row: the sender must never get a delivery it cannot sign
	decrypt(endpoint.secretEnc);
	const delivery = await db.outboundDelivery.create({
		data: {
			programId,
			event,
			submissionId,
			url: endpoint.url,
			status: 'PENDING',
			payload: JSON.stringify(payload)
		}
	});
	await notifyDelivery(delivery.id);
}

// never throws: a webhook problem must not turn a committed decision into a 500
export async function dispatchReviewWebhook(input: DispatchInput): Promise<DispatchOutcome> {
	try {
		const endpoint = await db.outboundEndpoint.findUnique({
			where: { programId: input.programId }
		});
		const target = await usableEndpoint(endpoint, input.programId, input.submissionId, input.event);
		if (typeof target === 'string') return target;

		const [submission, reviewer] = await Promise.all([
			db.submission.findUnique({
				where: { id: input.submissionId },
				include: {
					maker: true,
					// row id order, the order ari-webhooks sends: unordered, the arrays followed the query plan
					collaborators: { include: { maker: true }, orderBy: { id: 'asc' } },
					hours: { select: { trackingFromAt: true } },
					clips: { select: { url: true } },
					program: { select: { hoursJustification: true, priorityReview: true } }
				}
			}),
			db.user.findUnique({
				where: { id: input.reviewerId },
				select: { email: true, slackId: true }
			})
		]);
		if (!submission) return 'failed';

		const fieldDefinitions = input.fields
			? await db.reviewField.findMany({
					where: { programId: input.programId },
					select: { key: true, label: true, type: true }
				})
			: [];

		const payload = buildReviewPayload({ input, submission, reviewer, fieldDefinitions });

		await queuePayload(target, input.programId, input.submissionId, input.event, payload);
		return 'queued';
	} catch (error) {
		await logQueueFailure(input.programId, input.submissionId, input.event, error);
		return 'failed';
	}
}

// never throws: the committed edit is not rolled back by webhook trouble
export async function dispatchShipUpdatedWebhook(input: {
	programId: string;
	submissionId: string;
	externalId: string;
	editorId: string;
	changes: ShipEditChange[];
	ship: ReturnType<typeof buildShipSnapshot>;
}): Promise<DispatchOutcome> {
	try {
		const [endpoint, editor] = await Promise.all([
			db.outboundEndpoint.findUnique({ where: { programId: input.programId } }),
			db.user.findUnique({
				where: { id: input.editorId },
				select: { email: true, slackId: true }
			})
		]);
		const target = await usableEndpoint(
			endpoint,
			input.programId,
			input.submissionId,
			'ship.updated'
		);
		if (typeof target === 'string') return target;

		await queuePayload(
			target,
			input.programId,
			input.submissionId,
			'ship.updated',
			buildShipUpdatedPayload({
				submissionId: input.submissionId,
				externalId: input.externalId,
				changes: input.changes,
				ship: input.ship,
				editor
			})
		);
		return 'queued';
	} catch (error) {
		await logQueueFailure(input.programId, input.submissionId, 'ship.updated', error);
		return 'failed';
	}
}

// a resend is a fresh delivery with a new id
export async function redispatchLastReview(submissionId: string): Promise<DispatchOutcome> {
	const submission = await db.submission.findUnique({
		where: { id: submissionId },
		include: {
			collaborators: {
				orderBy: { id: 'asc' },
				select: {
					makerId: true,
					hackatimeMinutes: true,
					afterLastCommitMinutes: true,
					programMinutes: true,
					hackatimeSeconds: true,
					afterLastCommitSeconds: true,
					programSeconds: true
				}
			},
			commits: { select: { id: true, codingSeconds: true, makerId: true } },
			devlogs: { select: { id: true, minutes: true, seconds: true, makerId: true } },
			clips: { select: { id: true, lengthSeconds: true, makerId: true } },
			hours: {
				select: {
					hackatimeMinutes: true,
					afterLastCommitMinutes: true,
					programMinutes: true,
					hackatimeSeconds: true,
					afterLastCommitSeconds: true,
					programSeconds: true
				}
			},
			reviews: { orderBy: { createdAt: 'desc' }, take: 1 }
		}
	});
	if (!submission) return 'noDecision';
	const input = buildRedispatchInput(submission);
	if (!input) return 'noDecision';
	return dispatchReviewWebhook(input);
}
