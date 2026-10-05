import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { makerDisplaySelect, reviewedRow } from '$lib/server/serialize';
import { trackScope, trackWhere, requirePermission } from '$lib/server/authz';
import { redispatchLastReview, type DispatchOutcome } from '$lib/server/outbound';
import { tablePageSize } from '$lib/pagination';
import { listParam, pageParam, trackParam } from '$lib/shipList';
import type { Actions, PageServerLoad } from './$types';

// reverted was decided then unshipped, so it stays in the history. withdrawn was never reviewed
const decidedStatuses = ['approved', 'changes', 'rejected', 'reverted'] as const;
type DecidedStatus = (typeof decidedStatuses)[number];

type ResendRefusal = Exclude<DispatchOutcome, 'queued'>;

const resendRefusal: Record<ResendRefusal, string> = {
	noEndpoint: 'This program has no webhook address turned on. Set one up in Settings.',
	notSigned: 'This program has no webhook signing secret yet. Create one in Settings.',
	blockedUrl: 'The webhook address was not accepted. Check it in Settings.',
	noDecision: 'Nothing to resend. This ship has no recorded decision.',
	failed: 'The webhook could not be queued. Try again, and tell an organizer if it keeps failing.'
};

const resendStatus: Record<ResendRefusal, number> = {
	noEndpoint: 409,
	notSigned: 409,
	blockedUrl: 409,
	noDecision: 400,
	failed: 500
};

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { programId, meta } = await parent();
	// open to every reviewer, track-scoped. VIEW_REVIEWED gates older review data on the
	// review screen, not this list
	const scope = trackScope(locals.user!, programId);
	const scoped = { programId, status: { in: [...decidedStatuses] }, ...trackWhere(scope) };

	const track = trackParam(url);
	const decisions = listParam(url, 'decision', decidedStatuses) as DecidedStatus[];
	// the viewer's filters only ever narrow the scoped set
	const where = {
		...scoped,
		AND: [track ? { track } : {}, decisions.length ? { status: { in: decisions } } : {}]
	};

	const [byStatus, byTrack, total] = await Promise.all([
		db.submission.groupBy({ by: ['status'], where: scoped, _count: { _all: true } }),
		db.submission.groupBy({ by: ['track'], where: scoped, _count: { _all: true } }),
		db.submission.count({ where })
	]);

	const page = pageParam(url, total);
	const reviewed = await db.submission.findMany({
		where,
		select: {
			id: true,
			title: true,
			status: true,
			track: true,
			receivedAt: true,
			thumbnailUrl: true,
			authorNameOverrides: true,
			maker: { select: makerDisplaySelect },
			hours: true,
			collaborators: {
				select: { makerId: true, maker: { select: makerDisplaySelect } },
				orderBy: { id: 'asc' }
			},
			reviews: {
				select: {
					approvedMinutes: true,
					approvedSeconds: true,
					settlementVersion: true,
					createdAt: true,
					reviewer: { select: { name: true, avatarColor: true, slackId: true } }
				},
				orderBy: { createdAt: 'desc' },
				take: 1
			}
		},
		orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
		skip: page * tablePageSize(),
		take: tablePageSize()
	});

	const tally = (status: DecidedStatus) =>
		byStatus.find((entry) => entry.status === status)?._count._all ?? 0;

	return {
		rows: reviewed.map((ship) => reviewedRow(ship, meta.color)),
		total,
		page,
		track,
		decisions,
		tallies: decidedStatuses.map((status) => ({ status, count: tally(status) })),
		bothTracks: byTrack.length > 1
	};
};

export const actions: Actions = {
	resend: async ({ request, params, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Not signed in.' });
		requirePermission(user, params.program, 'OVERRIDE_DECISIONS');
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing submission id.' });
		// scoped to this program so an id from another program cannot be resent here
		const submission = await db.submission.findFirst({
			where: { id, programId: params.program },
			select: { id: true }
		});
		if (!submission) return fail(404, { error: 'Submission not found.' });
		const outcome = await redispatchLastReview(id);
		if (outcome !== 'queued') return fail(resendStatus[outcome], { error: resendRefusal[outcome] });
		return { resent: true };
	}
};
