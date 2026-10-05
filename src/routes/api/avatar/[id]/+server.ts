import { error, type RequestHandler } from '@sveltejs/kit';
import { avatarImageUrl } from '$lib/server/slack';
import { readMakerIdentity } from '$lib/server/priorityForm';

export const GET: RequestHandler = async ({ params, locals, cookies }) => {
	if (!locals.user && !readMakerIdentity(cookies)) throw error(401, 'Unauthorized');

	const image = await avatarImageUrl(params.id ?? '');
	if (!image) throw error(404, 'No avatar');

	// built by hand: sveltekit drops setHeaders on a thrown redirect, so nothing would be cached
	return new Response(null, {
		status: 302,
		headers: {
			location: image,
			'cache-control': 'private, max-age=3600' // 1 hour: 60 * 60
		}
	});
};
