import { json, type RequestHandler } from '@sveltejs/kit';
import { shipTimeline } from '$lib/server/review/timeline';

export const GET: RequestHandler = async ({ params, locals }) =>
	json({ items: await shipTimeline(locals.user, params.program ?? '', params.id ?? '') });
