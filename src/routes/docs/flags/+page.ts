import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// old bookmarks: the docs became a webhook-only integration guide
export const load = () => {
	throw redirect(308, resolve('/docs/webhooks'));
};
