import { json, type RequestHandler } from '@sveltejs/kit';
import { saveDraft } from '$lib/server/review/draft';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	const body = await request.json().catch(() => null);
	const saved = await saveDraft(locals.user, params.program ?? '', params.id ?? '', body);
	if (!saved.ok) return json({ error: saved.error }, { status: saved.status });
	return json({ ok: true });
};
