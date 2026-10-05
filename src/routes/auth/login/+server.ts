import { redirect, type RequestHandler } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { dev } from '$app/environment';
import { buildAuthorizeUrl, stateCookie } from '$lib/server/auth';
import { formTokenPattern } from '$lib/server/priorityForm';
import { safeReturnPath } from '$lib/server/signIn';

export const GET: RequestHandler = ({ url, cookies, locals }) => {
	const reauth = url.searchParams.get('reauth') === '1';
	// only a well-formed form token may ride the state cookie into a redirect path
	const rawPriority = url.searchParams.get('priority');
	const priorityToken = rawPriority && formTokenPattern.test(rawPriority) ? rawPriority : null;

	// a priority-form round-trip is independent of any reviewer session
	if (!priorityToken) {
		if (locals.user && !reauth) throw redirect(303, '/programs');
		if (reauth && !locals.user) throw redirect(303, '/login');
	}

	// the cookie is httponly and server-set, so the context beside the token cannot be tampered with
	const token = randomBytes(16).toString('base64url');
	const state = priorityToken
		? { t: token, k: 2 as const, f: priorityToken }
		: reauth
			? {
					t: token,
					k: 1 as const,
					p: url.searchParams.get('program') ?? '',
					r: safeReturnPath(url.searchParams.get('return'))
				}
			: { t: token };

	cookies.set(stateCookie, JSON.stringify(state), {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 600 // 10 minutes in seconds: 10 * 60
	});
	throw redirect(303, buildAuthorizeUrl(token, reauth ? { prompt: 'login' } : undefined));
};
