import { db } from '$lib/server/db';
import type { Prisma } from '$db';

export const claimTtlMs = (): number => 1800000; // 30 min: 30 * 60 * 1000

export const claimStaleBefore = (): Date => new Date(Date.now() - claimTtlMs());

export type CloseReason = 'left' | 'idle' | 'decided' | 'taken';

// idempotent: the release, move-on and idle-reap paths overlap and must not double-log
export async function closeOpenSession(
	client: Prisma.TransactionClient,
	submissionId: string,
	reviewerId: string,
	reason: CloseReason
): Promise<void> {
	const openSession = await client.submissionOpen.findFirst({
		where: { submissionId, reviewerId, closedAt: null },
		orderBy: { openedAt: 'desc' },
		select: { id: true }
	});
	if (!openSession) return;
	await client.submissionOpen.update({
		where: { id: openSession.id },
		data: { closedAt: new Date(), closeReason: reason }
	});
}

const isClaimable = (status: string) => status === 'pending';

export type ClaimState = {
	byId: string;
	byName: string;
	byColor: string;
	bySlackId: string | null;
	at: Date;
};

export function isClaimStale(claimedAt: Date | null | undefined): boolean {
	if (!claimedAt) return true;
	return Date.now() - claimedAt.getTime() > claimTtlMs();
}

export type ClaimResult =
	| { ok: true }
	| { ok: false; reason: 'locked'; by: ClaimState }
	| { ok: false; reason: 'closed' };

// one claim per reviewer: sessions close first, then the claims drop
async function releaseOtherClaims(
	transaction: Prisma.TransactionClient,
	submissionId: string,
	reviewerId: string
): Promise<void> {
	const otherClaims = await transaction.submission.findMany({
		where: { claimedById: reviewerId, id: { not: submissionId } },
		select: { id: true }
	});
	for (const otherClaim of otherClaims) {
		await closeOpenSession(transaction, otherClaim.id, reviewerId, 'left');
	}
	await transaction.submission.updateMany({
		where: { claimedById: reviewerId, id: { not: submissionId } },
		data: { claimedById: null, claimedAt: null }
	});
}

export async function claimSubmission(
	submissionId: string,
	reviewerId: string
): Promise<ClaimResult> {
	const staleBefore = claimStaleBefore();
	const now = new Date();

	return db.$transaction(async (transaction) => {
		const prior = await transaction.submission.findUnique({
			where: { id: submissionId },
			select: { claimedById: true, claimedAt: true }
		});
		// a reload of a claim we already hold live is not a new open
		const alreadyMineLive = prior?.claimedById === reviewerId && !isClaimStale(prior.claimedAt);

		await releaseOtherClaims(transaction, submissionId, reviewerId);

		// guard lives in the where so concurrent opens cannot both win
		const taken = await transaction.submission.updateMany({
			where: {
				id: submissionId,
				status: { in: ['pending'] },
				OR: [{ claimedById: null }, { claimedById: reviewerId }, { claimedAt: { lt: staleBefore } }]
			},
			data: { claimedById: reviewerId, claimedAt: now }
		});
		if (taken.count === 1) {
			if (!alreadyMineLive) {
				// close the stale sessions this open displaces: the reaper only closes the newest
				// row, so a stacked older one would stay open forever
				if (prior?.claimedById && prior.claimedById !== reviewerId) {
					await closeOpenSession(transaction, submissionId, prior.claimedById, 'idle');
				}
				await closeOpenSession(transaction, submissionId, reviewerId, 'idle');
				await transaction.submissionOpen.create({ data: { submissionId, reviewerId } });
			}
			return { ok: true } as const;
		}

		const submission = await transaction.submission.findUnique({
			where: { id: submissionId },
			select: {
				status: true,
				claimedAt: true,
				claimedBy: { select: { id: true, name: true, avatarColor: true, slackId: true } }
			}
		});
		if (!submission || !isClaimable(submission.status)) {
			return { ok: false, reason: 'closed' } as const;
		}
		if (submission.claimedBy && !isClaimStale(submission.claimedAt)) {
			return {
				ok: false,
				reason: 'locked',
				by: {
					byId: submission.claimedBy.id,
					byName: submission.claimedBy.name,
					byColor: submission.claimedBy.avatarColor,
					bySlackId: submission.claimedBy.slackId,
					at: submission.claimedAt!
				}
			} as const;
		}
		// raced into a slot freed between the update and this read. a retry claims it
		return { ok: false, reason: 'closed' } as const;
	});
}

// caller gates on OVERRIDE_DECISIONS
export async function takeoverClaim(
	submissionId: string,
	reviewerId: string
): Promise<{ ok: true } | { ok: false; reason: 'closed' }> {
	const now = new Date();

	return db.$transaction(async (transaction) => {
		const prior = await transaction.submission.findUnique({
			where: { id: submissionId },
			select: { status: true, claimedById: true, claimedAt: true }
		});
		if (!prior || !isClaimable(prior.status)) return { ok: false, reason: 'closed' } as const;

		const alreadyMineLive = prior.claimedById === reviewerId && !isClaimStale(prior.claimedAt);

		if (prior.claimedById && prior.claimedById !== reviewerId) {
			await closeOpenSession(transaction, submissionId, prior.claimedById, 'taken');
		}

		await releaseOtherClaims(transaction, submissionId, reviewerId);

		// status guard in the where so a decision landing mid-takeover wins
		const taken = await transaction.submission.updateMany({
			where: { id: submissionId, status: { in: ['pending'] } },
			data: { claimedById: reviewerId, claimedAt: now }
		});
		if (taken.count !== 1) return { ok: false, reason: 'closed' } as const;
		if (!alreadyMineLive) {
			await closeOpenSession(transaction, submissionId, reviewerId, 'idle');
			await transaction.submissionOpen.create({ data: { submissionId, reviewerId } });
		}
		return { ok: true } as const;
	});
}

// never extends a claim on a ship that left the queue: it must age out for the sweep
export async function heartbeatClaim(submissionId: string, reviewerId: string): Promise<boolean> {
	const refreshed = await db.submission.updateMany({
		where: { id: submissionId, claimedById: reviewerId, status: { in: ['pending'] } },
		data: { claimedAt: new Date() }
	});
	return refreshed.count === 1;
}

export async function releaseClaim(submissionId: string, reviewerId: string): Promise<void> {
	const released = await db.submission.updateMany({
		where: { id: submissionId, claimedById: reviewerId },
		data: { claimedById: null, claimedAt: null }
	});
	// only when we actually held it: a stale beacon must not close someone else's session
	if (released.count === 1) await closeOpenSession(db, submissionId, reviewerId, 'left');
}

export async function canActOnSubmission(
	submissionId: string,
	reviewerId: string
): Promise<boolean> {
	const submission = await db.submission.findUnique({
		where: { id: submissionId },
		select: { status: true, claimedById: true, claimedAt: true }
	});
	if (!submission) return false;
	if (!isClaimable(submission.status)) return true;
	if (submission.claimedById === reviewerId) return true;
	return !submission.claimedById || isClaimStale(submission.claimedAt);
}
