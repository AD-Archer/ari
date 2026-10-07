import { privateProvider } from '$private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => ({
	user: locals.user,
	// a blocked user only sees the nda page, and the overlay's requests would be refused anyway
	privateOverlay: url.pathname === '/nda' ? null : await privateProvider.appOverlayData(locals.user)
});
