import { redirect, type RequestHandler } from '@sveltejs/kit';
import { sessionCookie, invalidateSession } from '$lib/server/auth';

const signOut: RequestHandler = async ({ cookies }) => {
	const rawToken = cookies.get(sessionCookie);
	if (rawToken) await invalidateSession(rawToken);
	cookies.delete(sessionCookie, { path: '/' });
	throw redirect(303, '/login');
};

export const GET = signOut;
export const POST = signOut;
