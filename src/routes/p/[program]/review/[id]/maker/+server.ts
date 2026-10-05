import { json, type RequestHandler } from '@sveltejs/kit';
import { shipMakers } from '$lib/server/review/makers';

export const GET: RequestHandler = async ({ params, locals }) =>
	json({ makers: await shipMakers(locals.user, params.program ?? '', params.id ?? '') });
