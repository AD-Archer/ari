import { error, json, type RequestHandler } from '@sveltejs/kit';
import { assertCanView } from '$lib/server/review/guards';
import { fetchFileSource } from '$lib/server/webhooks';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	await assertCanView(locals.user, params.program ?? '', params.id ?? '');
	const path = url.searchParams.get('path') ?? '';
	// 4096: the longest path worth forwarding
	if (!path || path.length > 4096 || path.includes('\0')) throw error(400, 'Invalid file path');
	return json(await fetchFileSource(params.id ?? '', path));
};
