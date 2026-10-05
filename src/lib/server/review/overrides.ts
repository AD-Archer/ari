import { error } from '@sveltejs/kit';
import { overrideProblems } from '$lib/review/reviewRules';
import type { ActionOutcome, OverrideResult } from '$lib/review/reviewTypes';
import { requirePermission } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { enqueueJob } from '$lib/server/jobs';
import { dispatchReviewWebhook } from '$lib/server/outbound';
import { shipAuthorName } from '$lib/server/serialize';
import { teardownVms } from '$lib/server/vm';
import {
	assertAccess,
	assertTrack,
	done,
	refuse,
	refuseProblems,
	shipVmIds
} from '$lib/server/review/guards';

async function decidedShip(user: App.SessionUser, programId: string, submissionId: string) {
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		include: { maker: true }
	});
	if (!ship) throw error(404, 'Submission not found');
	assertAccess(user, ship.programId);
	assertTrack(user, ship.programId, ship.track);
	return ship;
}

// unship: terminal, the ship does not return to the queue and the program is told why
export async function revertShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	form: FormData
): Promise<ActionOutcome<OverrideResult>> {
	requirePermission(user, programId, 'OVERRIDE_DECISIONS');
	const publicNote = String(form.get('public') ?? '');
	const auditReason = String(form.get('audit') ?? '');
	const texts = overrideProblems({
		action: 'revert',
		publicNote,
		auditReason,
		status: 'approved',
		viewer: { canOverride: true }
	});
	if (texts.length) return refuseProblems(texts);

	const ship = await decidedShip(user, programId, submissionId);
	const problems = overrideProblems({
		action: 'revert',
		publicNote,
		auditReason,
		status: ship.status,
		viewer: { canOverride: true }
	});
	if (problems.length) return refuseProblems(problems);

	const vmids = await shipVmIds(ship.id);
	await db.$transaction([
		db.submission.update({ where: { id: ship.id }, data: { status: 'reverted' } }),
		db.reviewerVm.deleteMany({ where: { submissionId: ship.id } }),
		db.activityEvent.create({
			data: {
				programId: ship.programId,
				kind: 'REVERT',
				actorId: user.id,
				submissionId: ship.id,
				text: `Unshipped ${ship.title}: ${auditReason.trim()}`,
				meta: {
					fromStatus: ship.status,
					toStatus: 'reverted',
					title: ship.title,
					maker: shipAuthorName(ship, ship.maker),
					auditReason: auditReason.trim(),
					hasPublicMessage: publicNote.trim().length > 0
				}
			}
		})
	]);
	teardownVms(vmids);

	const webhook = await dispatchReviewWebhook({
		event: 'review.reverted',
		decision: null,
		programId: ship.programId,
		submissionId: ship.id,
		reviewerId: user.id,
		note: publicNote,
		auditNote: auditReason.trim()
	});
	return done({ success: true, webhook });
}

// rollback: the decision is withdrawn and the ship is captured again before it reopens
export async function requeueShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	form: FormData
): Promise<ActionOutcome<OverrideResult>> {
	requirePermission(user, programId, 'OVERRIDE_DECISIONS');
	const auditReason = String(form.get('audit') ?? '');
	const input = { action: 'requeue' as const, publicNote: '', auditReason };
	const texts = overrideProblems({ ...input, status: 'approved', viewer: { canOverride: true } });
	if (texts.length) return refuseProblems(texts);

	const ship = await decidedShip(user, programId, submissionId);
	const problems = overrideProblems({
		...input,
		status: ship.status,
		viewer: { canOverride: true }
	});
	if (problems.length) return refuseProblems(problems);

	const vmids = await shipVmIds(ship.id);
	try {
		const requeued = await db.$transaction(async (transaction) => {
			// only proceeds while still decided, so a concurrent revert cannot double-fire
			const updated = await transaction.submission.updateMany({
				where: { id: ship.id, status: { in: ['approved', 'changes', 'rejected'] } },
				// the enrich job promotes processing to pending once the fresh capture lands
				data: { status: 'processing' }
			});
			if (updated.count === 0) return false;
			await transaction.reviewerVm.deleteMany({ where: { submissionId: ship.id } });
			await transaction.activityEvent.create({
				data: {
					programId: ship.programId,
					kind: 'REVERT',
					actorId: user.id,
					submissionId: ship.id,
					text: `Returned ${ship.title} to the queue: ${auditReason.trim()}`,
					meta: {
						op: 'requeued',
						fromStatus: ship.status,
						toStatus: 'processing',
						title: ship.title,
						maker: shipAuthorName(ship, ship.maker),
						auditReason: auditReason.trim()
					}
				}
			});
			return true;
		});
		if (!requeued) return refuse(400, 'notDecided', 'Only a decided ship can return to the queue.');
	} catch (caught) {
		// one open ship per project: a newer ship is already on the queue
		if ((caught as { code?: string })?.code === 'P2002')
			return refuse(
				409,
				'newerShipOpen',
				'A newer ship of this project is already open. Decide or unship it before returning this one to the queue.'
			);
		throw caught;
	}

	teardownVms(vmids);
	void enqueueJob('enrich', ship.id);

	const webhook = await dispatchReviewWebhook({
		event: 'review.requeued',
		decision: null,
		programId: ship.programId,
		submissionId: ship.id,
		reviewerId: user.id,
		note: '',
		auditNote: auditReason.trim()
	});
	return done({ success: true, webhook });
}
