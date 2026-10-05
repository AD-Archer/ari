import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	canAccessProgram,
	trackScope,
	trackWhere,
	selfReviewWhere,
	hasPermission
} from '$lib/server/authz';
import { authorLabel, evidenceSeconds } from '$lib/server/serialize';
import { matchedDetail, searchShipCandidates } from '$lib/server/shipSearch';
import type { SubmissionStatus } from '$db';

export const GET: RequestHandler = async ({ url, params, locals }) => {
	const user = locals.user;
	if (!user) return json({ error: 'unauthorized' }, { status: 401 });

	const query = (url.searchParams.get('q') ?? '').trim();
	if (!query) return json({ subs: [], people: [] });

	const program = await db.program.findUnique({
		where: { id: params.program ?? '' },
		select: { id: true, color: true, reviewersCannotReviewOwnProjects: true }
	});
	if (!program) return json({ error: 'not_found' }, { status: 404 });

	// the program layout gate does not run for an endpoint, so access is enforced here
	if (!canAccessProgram(user, program.id)) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const matches = { contains: query, mode: 'insensitive' as const };

	// the review screen refuses held and parked ships without these, so they are not surfaced
	const hiddenStatuses: SubmissionStatus[] = [];
	if (!hasPermission(user, program.id, 'SECOND_PASS')) hiddenStatuses.push('secondpass');
	if (!hasPermission(user, program.id, 'VIEW_FRAUD')) hiddenStatuses.push('fraudreview');

	const [candidates, memberships] = await Promise.all([
		searchShipCandidates(program.id, query),
		db.membership.findMany({
			where: {
				programId: program.id,
				user: { OR: [{ name: matches }, { email: matches }] }
			},
			include: { user: true },
			take: 4
		})
	]);

	// the ranking knows nothing about access: the same rules as the queue decide what is listed
	const visible = await db.submission.findMany({
		where: {
			programId: program.id,
			id: { in: candidates.map((candidate) => candidate.id) },
			...trackWhere(trackScope(user, program.id)),
			...(hiddenStatuses.length ? { status: { notIn: hiddenStatuses } } : {}),
			...selfReviewWhere(user, program.reviewersCannotReviewOwnProjects, program.id)
		},
		include: {
			maker: true,
			hours: true,
			collaborators: { include: { maker: true }, orderBy: { id: 'asc' } }
		}
	});
	const byId = new Map(visible.map((submission) => [submission.id, submission]));
	const ranked = candidates.filter((candidate) => byId.has(candidate.id));
	// someone's email, name or id lists every ship of theirs. 50: a full dropdown, scrolled.
	// anything else is a lookup for one ship. 8: the best fits, readable at a glance
	const people = ranked.filter((candidate) => candidate.byPerson).slice(0, 50);
	// a ship that has the words as typed pushes out the ones that are only close to them
	const written = ranked.filter((candidate) => candidate.exact);
	const shown = people.length ? people : (written.length ? written : ranked).slice(0, 8);
	const submissions = shown.flatMap((candidate) => byId.get(candidate.id) ?? []);

	return json({
		subs: submissions.map((submission) => ({
			id: submission.id,
			title: submission.title,
			author: authorLabel(submission),
			detail: matchedDetail(query, {
				repoUrl: submission.repoUrl,
				demoUrl: submission.demoUrl,
				people: [submission.maker, ...submission.collaborators.map((entry) => entry.maker)]
			}),
			slackId: submission.collaborators.length ? null : submission.maker.slackId,
			color: program.color,
			evidenceSeconds: evidenceSeconds(submission.hours),
			href: `/p/${program.id}/review/${submission.id}`
		})),
		people: memberships.map((membership) => ({
			name: membership.user.name,
			email: membership.user.email,
			color: membership.user.avatarColor,
			slackId: membership.user.slackId,
			href: `/p/${program.id}/reviewers?focus=${encodeURIComponent(membership.user.email)}`
		}))
	});
};
