import { db } from '$lib/server/db';
import { trackScope, trackWhere, selfReviewWhere } from '$lib/server/authz';
import { reviewTime } from '$lib/server/reviewTime';
import { systemUserId } from '$lib/server/systemUser';
import type { PageServerLoad } from './$types';

type ReviewerCount = {
	id: string;
	name: string;
	color: string;
	slackId: string | null;
	count: number;
};
type Reviewer = { id: string; name: string; avatarColor: string; slackId: string | null };

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// confirming a held decision edits the review in place, so an organizer's pass exists only
// as an activity event. these are shaped like review rows so the chart can bucket both
async function secondPassCreditEvents(
	programId: string,
	since: Date,
	scopeWhere: ReturnType<typeof trackWhere>
) {
	const events = await db.activityEvent.findMany({
		where: {
			programId,
			createdAt: { gte: since },
			kind: { in: ['APPROVED', 'CHANGES', 'REJECTED'] },
			OR: [
				{ meta: { path: ['op'], equals: 'second-pass-confirmed' } },
				{ meta: { path: ['op'], equals: 'second-pass-overridden' } }
			]
		},
		select: { actorId: true, createdAt: true, submissionId: true }
	});
	if (events.length === 0) return [] as { createdAt: Date; reviewer: Reviewer }[];

	let allowedIds: Set<string> | null = null;
	if (Object.keys(scopeWhere).length) {
		const submissionIds = events
			.map((event) => event.submissionId)
			.filter((id): id is string => !!id);
		const inTrack = await db.submission.findMany({
			where: { programId, ...scopeWhere, id: { in: submissionIds } },
			select: { id: true }
		});
		allowedIds = new Set(inTrack.map((submission) => submission.id));
	}

	const actorIds = [
		...new Set(events.map((event) => event.actorId).filter((id): id is string => !!id))
	];
	const actors = await db.user.findMany({
		where: { id: { in: actorIds } },
		select: { id: true, name: true, avatarColor: true, slackId: true }
	});
	const actorById = new Map(actors.map((actor) => [actor.id, actor]));

	return events.flatMap((event) => {
		if (allowedIds && (!event.submissionId || !allowedIds.has(event.submissionId))) return [];
		const reviewer = event.actorId ? actorById.get(event.actorId) : undefined;
		return reviewer ? [{ createdAt: event.createdAt, reviewer }] : [];
	});
}

const toCount = (reviewer: Reviewer, count: number): ReviewerCount => ({
	id: reviewer.id,
	name: reviewer.name,
	color: reviewer.avatarColor,
	slackId: reviewer.slackId,
	count
});

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { programId, meta } = await parent();

	const scopeWhere = trackWhere(trackScope(locals.user!, programId));
	const ownFilter = selfReviewWhere(locals.user!, meta.excludeOwnProjects, programId);

	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);
	const monthStart = new Date(startOfToday);
	monthStart.setDate(startOfToday.getDate() - 29); // 30 day window including today

	const [
		pending,
		changes,
		approved,
		rejected,
		newToday,
		reviewedTodayReviews,
		monthReviews,
		secondPassEvents,
		monthReviewTime
	] = await Promise.all([
		db.submission.count({ where: { programId, status: 'pending', ...scopeWhere, ...ownFilter } }),
		db.submission.count({ where: { programId, status: 'changes', ...scopeWhere } }),
		db.submission.count({ where: { programId, status: 'approved', ...scopeWhere } }),
		db.submission.count({ where: { programId, status: 'rejected', ...scopeWhere } }),
		db.submission.count({
			where: {
				programId,
				ingestedAt: { gte: startOfToday },
				status: { not: 'processing' },
				...scopeWhere
			}
		}),
		db.review.count({
			where: { submission: { programId, ...scopeWhere }, createdAt: { gte: startOfToday } }
		}),
		db.review.findMany({
			where: {
				submission: { programId, ...scopeWhere },
				createdAt: { gte: monthStart },
				// the system account's automated decisions are not reviewer work
				reviewerId: { not: systemUserId }
			},
			select: {
				createdAt: true,
				reviewer: { select: { id: true, name: true, avatarColor: true, slackId: true } }
			}
		}),
		secondPassCreditEvents(programId, monthStart, scopeWhere),
		reviewTime(programId, monthStart, scopeWhere)
	]);

	const reviewedToday =
		reviewedTodayReviews +
		secondPassEvents.filter((event) => event.createdAt >= startOfToday).length;

	// 30: one bucket per day of the month window
	const buckets = Array.from({ length: 30 }, () => ({
		count: 0,
		reviewers: new Map<string, ReviewerCount>()
	}));
	for (const entry of [...monthReviews, ...secondPassEvents]) {
		const dayIndex = Math.floor(
			(entry.createdAt.getTime() - monthStart.getTime()) / 86400000 // ms in a day: 24 * 60 * 60 * 1000
		);
		if (dayIndex < 0 || dayIndex >= buckets.length) continue;
		const bucket = buckets[dayIndex];
		bucket.count++;
		const existing = bucket.reviewers.get(entry.reviewer.id);
		if (existing) existing.count++;
		else bucket.reviewers.set(entry.reviewer.id, toCount(entry.reviewer, 1));
	}
	const dayOf = (dayIndex: number, tickFor: (date: Date) => string) => {
		const date = new Date(monthStart);
		date.setDate(monthStart.getDate() + dayIndex);
		return {
			tick: tickFor(date),
			date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
			count: buckets[dayIndex].count,
			reviewers: [...buckets[dayIndex].reviewers.values()].sort(
				(first, second) => second.count - first.count
			)
		};
	};
	// 7 and 23: the week is the last seven of the thirty buckets
	const weekly = Array.from({ length: 7 }, (_unused, index) =>
		dayOf(23 + index, (date) => dayLabels[date.getDay()])
	);
	// only every fifth slim bar gets an axis label, plus today (index 29)
	const monthly = buckets.map((_unused, index) =>
		dayOf(index, (date) => (index % 5 === 0 || index === 29 ? String(date.getDate()) : ''))
	);

	// a second-pass confirm or override counts the same as a direct decision
	const boardRows = new Map<string, ReviewerCount>();
	for (const entry of [...monthReviews, ...secondPassEvents]) {
		const row = boardRows.get(entry.reviewer.id) ?? toCount(entry.reviewer, 0);
		row.count++;
		boardRows.set(entry.reviewer.id, row);
	}
	const leaderboard = [...boardRows.values()]
		.sort((first, second) => second.count - first.count)
		.slice(0, 10);

	return {
		stats: {
			needsReview: pending,
			newToday,
			reviewedToday,
			medianReviewSeconds: monthReviewTime.medianSeconds,
			reviewDecisions: monthReviewTime.decisions,
			net: reviewedToday - newToday
		},
		weekly,
		monthly,
		byStatus: [
			{ status: 'approved' as const, count: approved },
			{ status: 'changes' as const, count: changes },
			{ status: 'rejected' as const, count: rejected },
			{ status: 'pending' as const, count: pending }
		],
		leaderboard
	};
};
