import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { getReviewerSessions, type ReviewSession } from '$lib/server/sessions';
import { storedApprovedSeconds } from '$lib/server/settlementStore';
import type { ReviewDecision, Track } from '$db';

export interface StatsRange {
	since: Date | null;
	until: Date | null;
	from: string | null;
	to: string | null;
}

// a half-open utc window [since, until). `to` counts its whole day, so until is the next midnight.
// a malformed bound is ignored rather than refused
export function parseRange(searchParams: URLSearchParams): StatsRange {
	const fromRaw = searchParams.get('from');
	const toRaw = searchParams.get('to');
	const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
	const since = fromRaw && dayPattern.test(fromRaw) ? new Date(`${fromRaw}T00:00:00.000Z`) : null;
	const until =
		toRaw && dayPattern.test(toRaw)
			? new Date(new Date(`${toRaw}T00:00:00.000Z`).getTime() + 86400000) // 1 day: 24 * 60 * 60 * 1000
			: null;
	const sinceValid = since !== null && !Number.isNaN(since.getTime());
	const untilValid = until !== null && !Number.isNaN(until.getTime());
	return {
		since: sinceValid ? since : null,
		until: untilValid ? until : null,
		from: sinceValid ? fromRaw : null,
		to: untilValid ? toRaw : null
	};
}

export const rangeActive = (range: StatsRange): boolean => Boolean(range.since || range.until);

export interface ReviewerOverview {
	stats: {
		total: number;
		week: number;
		approvalPercent: number;
		approvedSeconds: number;
		directTotal: number;
		secondPass: number;
		timeWorkedMs: number;
		sessionCount: number;
		vmCount: number;
	};
	recent: {
		id: string;
		submissionId: string;
		title: string;
		track: Track;
		thumb: string | null;
		decision: ReviewDecision;
		approvedSeconds: number;
		createdAt: Date;
	}[];
	vms: {
		id: string;
		vmType: string;
		submissionId: string | null;
		title: string | null;
		createdAt: Date;
	}[];
	sessions: ReviewSession[];
}

export async function reviewerOverview(
	programId: string,
	reviewerId: string,
	range: StatsRange,
	now: number = Date.now()
): Promise<ReviewerOverview> {
	const weekStart = new Date(now - 604800000); // 7 days: 7 * 24 * 60 * 60 * 1000
	const scoped = { reviewerId, submission: { programId } };

	// the range covers reviews, approved time, vms and sessions; the "this week" goal ignores it
	const active = rangeActive(range);
	const createdAt = active
		? { ...(range.since ? { gte: range.since } : {}), ...(range.until ? { lt: range.until } : {}) }
		: undefined;
	const rangeScoped = active ? { ...scoped, createdAt } : scoped;

	const [groups, weekDirect, recent, vms, sessions, secondPassEvents] = await Promise.all([
		db.review.groupBy({
			by: ['decision', 'settlementVersion'],
			where: rangeScoped,
			_count: { _all: true },
			_sum: { approvedMinutes: true, approvedSeconds: true }
		}),
		db.review.count({ where: { ...scoped, createdAt: { gte: weekStart } } }),
		db.review.findMany({
			where: rangeScoped,
			orderBy: { createdAt: 'desc' },
			take: 15,
			select: {
				id: true,
				decision: true,
				approvedMinutes: true,
				approvedSeconds: true,
				settlementVersion: true,
				createdAt: true,
				submission: { select: { id: true, title: true, track: true, thumbnailUrl: true } }
			}
		}),
		db.reviewerVm.findMany({
			where: { reviewerId, programId, ...(active ? { createdAt } : {}) },
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				vmType: true,
				createdAt: true,
				submission: { select: { id: true, title: true } }
			}
		}),
		getReviewerSessions(
			programId,
			reviewerId,
			active ? { since: range.since ?? undefined, until: range.until ?? undefined } : undefined
		),
		// confirming or overriding a held decision edits the review in place, so an organizer's
		// second pass exists only as an activity event. folded in exactly as the roster does
		db.activityEvent.findMany({
			where: {
				programId,
				actorId: reviewerId,
				kind: { in: ['APPROVED', 'CHANGES', 'REJECTED'] },
				OR: [
					{ meta: { path: ['op'], equals: 'second-pass-confirmed' } },
					{ meta: { path: ['op'], equals: 'second-pass-overridden' } }
				]
			},
			select: { kind: true, createdAt: true }
		})
	]);

	let directTotal = 0;
	let directApproved = 0;
	let approvedSeconds = 0;
	for (const group of groups) {
		directTotal += group._count._all;
		if (group.decision === 'approved') directApproved += group._count._all;
		// linear in both columns, so the per-review rule holds for a per-version sum
		approvedSeconds += storedApprovedSeconds({
			settlementVersion: group.settlementVersion,
			approvedMinutes: group._sum.approvedMinutes ?? 0,
			approvedSeconds: group._sum.approvedSeconds ?? 0
		});
	}

	let secondPass = 0;
	let secondPassApproved = 0;
	let secondPassWeek = 0;
	for (const event of secondPassEvents) {
		const inRange =
			(!range.since || event.createdAt >= range.since) &&
			(!range.until || event.createdAt < range.until);
		if (inRange) {
			secondPass++;
			if (event.kind === 'APPROVED') secondPassApproved++;
		}
		if (event.createdAt >= weekStart) secondPassWeek++;
	}

	const total = directTotal + secondPass;
	return {
		stats: {
			total,
			week: weekDirect + secondPassWeek,
			approvalPercent:
				total > 0 ? Math.round(((directApproved + secondPassApproved) / total) * 100) : 0,
			approvedSeconds,
			directTotal,
			secondPass,
			timeWorkedMs: sessions.reduce((sum, session) => sum + session.totalMs, 0),
			sessionCount: sessions.length,
			vmCount: vms.length
		},
		recent: recent.map((review) => ({
			id: review.id,
			submissionId: review.submission.id,
			title: review.submission.title,
			track: review.submission.track,
			thumb: review.submission.thumbnailUrl,
			decision: review.decision,
			approvedSeconds: storedApprovedSeconds(review),
			createdAt: review.createdAt
		})),
		vms: vms.map((launch) => ({
			id: launch.id,
			vmType: launch.vmType,
			submissionId: launch.submission?.id ?? null,
			title: launch.submission?.title ?? null,
			createdAt: launch.createdAt
		})),
		sessions
	};
}

export interface CrossProgramRow {
	programId: string;
	name: string;
	color: string;
	reviews: number;
	approvedSeconds: number;
	vms: number;
	current: boolean;
}
export interface CrossProgramStats {
	totalReviews: number;
	approvedSeconds: number;
	totalVms: number;
	programs: CrossProgramRow[];
}

// only an org operator sees past the current program: anyone else gets nothing, so a program
// the viewer cannot open never shows up here
export async function crossProgramStats(
	viewer: App.SessionUser,
	reviewerId: string,
	currentProgramId: string
): Promise<CrossProgramStats | null> {
	if (!hasOrgPermission(viewer, 'OPERATE_ALL_PROGRAMS')) return null;

	const [reviews, vmGroups] = await Promise.all([
		db.review.findMany({
			where: { reviewerId },
			select: {
				approvedMinutes: true,
				approvedSeconds: true,
				settlementVersion: true,
				submission: {
					select: { programId: true, program: { select: { name: true, color: true } } }
				}
			}
		}),
		db.reviewerVm.groupBy({ by: ['programId'], where: { reviewerId }, _count: { _all: true } })
	]);

	const byProgram = new Map<string, CrossProgramRow>();
	const ensure = (programId: string, name: string, color: string): CrossProgramRow => {
		let row = byProgram.get(programId);
		if (!row) {
			row = {
				programId,
				name,
				color,
				reviews: 0,
				approvedSeconds: 0,
				vms: 0,
				current: programId === currentProgramId
			};
			byProgram.set(programId, row);
		}
		return row;
	};

	let approvedSeconds = 0;
	for (const review of reviews) {
		const row = ensure(
			review.submission.programId,
			review.submission.program.name,
			review.submission.program.color
		);
		const seconds = storedApprovedSeconds(review);
		row.reviews++;
		row.approvedSeconds += seconds;
		approvedSeconds += seconds;
	}

	// a program where they only launched vms and never decided a ship has no name yet
	const missing = vmGroups.map((group) => group.programId).filter((id) => !byProgram.has(id));
	if (missing.length) {
		const programs = await db.program.findMany({
			where: { id: { in: missing } },
			select: { id: true, name: true, color: true }
		});
		const known = new Map(programs.map((program) => [program.id, program]));
		for (const id of missing) {
			ensure(id, known.get(id)?.name ?? 'Unknown', known.get(id)?.color ?? 'var(--text-3)');
		}
	}
	for (const group of vmGroups) {
		ensure(group.programId, 'Unknown', 'var(--text-3)').vms += group._count._all;
	}

	return {
		totalReviews: reviews.length,
		approvedSeconds,
		totalVms: vmGroups.reduce((sum, group) => sum + group._count._all, 0),
		programs: [...byProgram.values()].sort((first, second) => second.reviews - first.reviews)
	};
}
