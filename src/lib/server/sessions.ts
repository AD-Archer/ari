import { db } from '$lib/server/db';
import { claimStaleBefore, claimTtlMs, type CloseReason } from '$lib/server/claims';
import { ago, whenLabel } from '$lib/server/serialize';

type Decision = 'approved' | 'changes' | 'rejected';

// 'live' is still in progress, 'unknown' is an open with no recorded end
export type SessionReason = CloseReason | 'live' | 'unknown';

export interface OpenInput {
	submissionId: string;
	title: string;
	openedAt: Date;
	closedAt: Date | null;
	closeReason: string | null;
}
export interface ReviewInput {
	submissionId: string;
	decision: Decision;
	createdAt: Date;
}

export interface SessionReview {
	submissionId: string;
	title: string;
	openedAt: Date;
	endedAt: Date;
	durationMs: number;
	decision: Decision | null;
	reason: SessionReason;
	live: boolean;
}
export interface ReviewSession {
	startedAt: Date;
	endedAt: Date;
	totalMs: number;
	reviewCount: number;
	reason: SessionReason;
	live: boolean;
	reviews: SessionReview[];
}

// a session is a run of opens with no idle-length gap. the gap is the claim ttl, so a
// session boundary lines up with when a claim would have been reaped
export function buildSessions(
	opens: OpenInput[],
	reviews: ReviewInput[],
	liveSubmissionId: string | null,
	now: number,
	idleMs: number = claimTtlMs()
): ReviewSession[] {
	const sortedOpens = [...opens].sort(
		(first, second) => first.openedAt.getTime() - second.openedAt.getTime()
	);

	// each decision is consumable once, so the nth open of a ship pairs with its nth decision
	const decisionsBySubmission = new Map<
		string,
		{ decision: Decision; at: number; used: boolean }[]
	>();
	for (const review of reviews) {
		const entry = { decision: review.decision, at: review.createdAt.getTime(), used: false };
		const decisions = decisionsBySubmission.get(review.submissionId);
		if (decisions) decisions.push(entry);
		else decisionsBySubmission.set(review.submissionId, [entry]);
	}
	for (const decisions of decisionsBySubmission.values()) {
		decisions.sort((first, second) => first.at - second.at);
	}

	const sessionReviews: SessionReview[] = sortedOpens.map((open, index) => {
		const openedMs = open.openedAt.getTime();
		// opening another ship releases this one, so nothing decided past that point belongs here
		const nextOpenedMs =
			index + 1 < sortedOpens.length ? sortedOpens[index + 1].openedAt.getTime() : Infinity;
		const match = decisionsBySubmission
			.get(open.submissionId)
			?.find((entry) => !entry.used && entry.at >= openedMs && entry.at < nextOpenedMs);
		if (match) match.used = true;

		const live = open.closedAt === null && open.submissionId === liveSubmissionId;
		// an orphan (never closed, never decided, not live) has zero length
		const endMs = open.closedAt
			? open.closedAt.getTime()
			: match
				? match.at
				: live
					? now
					: openedMs;
		const reason: SessionReason =
			(open.closeReason as CloseReason | null) ?? (match ? 'decided' : live ? 'live' : 'unknown');

		return {
			submissionId: open.submissionId,
			title: open.title,
			openedAt: open.openedAt,
			endedAt: new Date(endMs),
			durationMs: Math.max(0, endMs - openedMs),
			decision: match?.decision ?? null,
			reason,
			live
		};
	});

	const sessions: ReviewSession[] = [];
	for (const review of sessionReviews) {
		const current = sessions[sessions.length - 1];
		const previous = current?.reviews[current.reviews.length - 1];
		const startsNewSession =
			!current ||
			!previous ||
			previous.reason === 'idle' ||
			review.openedAt.getTime() - previous.endedAt.getTime() >= idleMs;
		if (startsNewSession) {
			sessions.push({
				startedAt: review.openedAt,
				endedAt: review.endedAt,
				totalMs: review.durationMs,
				reviewCount: 1,
				reason: review.reason,
				live: review.live,
				reviews: [review]
			});
		} else {
			current.reviews.push(review);
			current.endedAt = review.endedAt;
			current.totalMs += review.durationMs;
			current.reviewCount += 1;
			current.reason = review.reason;
			current.live = review.live;
		}
	}

	sessions.reverse();
	return sessions;
}

export async function getReviewerSessions(
	programId: string,
	reviewerId: string,
	window?: { since?: Date; until?: Date }
): Promise<ReviewSession[]> {
	const now = Date.now();
	const range =
		window && (window.since || window.until)
			? {
					...(window.since ? { gte: window.since } : {}),
					...(window.until ? { lt: window.until } : {})
				}
			: undefined;
	const [opens, reviews, liveClaim] = await Promise.all([
		db.submissionOpen.findMany({
			where: { reviewerId, submission: { programId }, ...(range ? { openedAt: range } : {}) },
			orderBy: { openedAt: 'asc' },
			select: {
				submissionId: true,
				openedAt: true,
				closedAt: true,
				closeReason: true,
				submission: { select: { title: true } }
			}
		}),
		db.review.findMany({
			where: { reviewerId, submission: { programId }, ...(range ? { createdAt: range } : {}) },
			select: { submissionId: true, decision: true, createdAt: true }
		}),
		// a stale claim is not live: its open reads as an orphan until the reaper closes it
		db.submission.findFirst({
			where: {
				claimedById: reviewerId,
				programId,
				status: 'pending',
				claimedAt: { gte: claimStaleBefore() }
			},
			select: { id: true }
		})
	]);

	return buildSessions(
		opens.map((open) => ({
			submissionId: open.submissionId,
			title: open.submission.title,
			openedAt: open.openedAt,
			closedAt: open.closedAt,
			closeReason: open.closeReason
		})),
		reviews.map((review) => ({
			submissionId: review.submissionId,
			decision: review.decision,
			createdAt: review.createdAt
		})),
		liveClaim?.id ?? null,
		now
	);
}

export interface WireReview {
	submissionId: string;
	title: string;
	decision: Decision | null;
	reason: SessionReason;
	live: boolean;
	durationMs: number;
	duration: string;
	whenLabel: string;
	ago: string;
}
export interface WireSession {
	startedWhen: string;
	startedAgo: string;
	reviewCount: number;
	totalMs: number;
	total: string;
	reason: SessionReason;
	live: boolean;
	reviews: WireReview[];
}

// label only, for how long a reviewer sat on a ship. never credited time
export function sessionDurationLabel(durationMs: number): string {
	const seconds = Math.max(0, Math.round(durationMs / 1000)); // ms in a second
	if (seconds < 60) return `${seconds}s`; // under a minute
	const minutes = Math.round(seconds / 60); // seconds in a minute
	if (minutes < 60) return `${minutes}m`; // under an hour
	const hours = Math.floor(minutes / 60); // minutes in an hour
	const rest = minutes % 60; // minutes in an hour
	return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function serializeSessions(sessions: ReviewSession[]): WireSession[] {
	return sessions.map((session) => ({
		startedWhen: whenLabel(session.startedAt),
		startedAgo: `${ago(session.startedAt)} ago`,
		reviewCount: session.reviewCount,
		totalMs: session.totalMs,
		total: sessionDurationLabel(session.totalMs),
		reason: session.reason,
		live: session.live,
		reviews: session.reviews.map((review) => ({
			submissionId: review.submissionId,
			title: review.title,
			decision: review.decision,
			reason: review.reason,
			live: review.live,
			durationMs: review.durationMs,
			duration: sessionDurationLabel(review.durationMs),
			whenLabel: whenLabel(review.openedAt),
			ago: `${ago(review.openedAt)} ago`
		}))
	}));
}
