import { error, json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Sign in first');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Expected a JSON body');
	}
	const rawName = (body as { name?: unknown })?.name;
	const name = typeof rawName === 'string' ? rawName.trim() : '';
	if (!name) throw error(400, 'Enter a name');
	if (name.length > 80) throw error(400, 'That name is too long (80 characters max)');

	// guarded in the where, not only on the session snapshot: answerable once across tabs
	const updated = await db.user.updateMany({
		where: { id: user.id, nameSource: 'PENDING' },
		data: { name, nameSource: 'CUSTOM' }
	});
	if (updated.count === 0) throw error(409, 'Your name is already set');

	return json({ ok: true });
};
