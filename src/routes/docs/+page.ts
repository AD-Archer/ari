import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export const load = () => {
	throw redirect(308, resolve('/docs/webhooks'));
};
