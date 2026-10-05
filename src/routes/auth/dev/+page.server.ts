import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sessionCookie, createSession } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { devLoginEnabled } from '$lib/server/devLogin';
import { systemUserId } from '$lib/server/systemUser';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!devLoginEnabled()) throw error(404, 'Not found');
	if (locals.user) throw redirect(303, '/programs');
	const users = await db.user.findMany({
		where: { id: { not: systemUserId } },
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			name: true,
			email: true,
			orgPermissions: true,
			memberships: {
				select: {
					isPoc: true,
					tracks: true,
					permissions: true,
					program: { select: { name: true } }
				}
			}
		}
	});
	return { users };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (!devLoginEnabled()) throw error(404, 'Not found');
		const userId = (await request.formData()).get('userId');
		if (typeof userId !== 'string' || userId === systemUserId) return fail(400);
		const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
		if (!user) return fail(404);

		const { rawToken, expiresAt } = await createSession(user.id);
		cookies.set(sessionCookie, rawToken, {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			expires: expiresAt
		});
		throw redirect(303, '/programs');
	}
};
