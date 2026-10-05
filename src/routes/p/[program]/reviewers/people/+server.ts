import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { hasPermission } from '$lib/server/authz';
import { systemUserId } from '$lib/server/systemUser';

// exposes user emails and feeds member management, so it takes the same gate as the mutations
export const GET: RequestHandler = async ({ url, params, locals }) => {
	const user = locals.user;
	if (!user) return json({ people: [] }, { status: 401 });

	const programId = params.program ?? '';
	if (!hasPermission(user, programId, 'MANAGE_REVIEWERS'))
		return json({ people: [] }, { status: 403 });

	const query = (url.searchParams.get('q') ?? '').trim();
	if (query.length < 2) return json({ people: [] });

	const matches = { contains: query, mode: 'insensitive' as const };
	const users = await db.user.findMany({
		where: { id: { not: systemUserId }, OR: [{ email: matches }, { name: matches }] },
		select: {
			email: true,
			name: true,
			avatarColor: true,
			slackId: true,
			memberships: { where: { programId }, select: { id: true } }
		},
		orderBy: { name: 'asc' },
		take: 6
	});

	return json({
		people: users.map((person) => ({
			email: person.email,
			name: person.name,
			color: person.avatarColor,
			slackId: person.slackId,
			member: person.memberships.length > 0
		}))
	});
};
