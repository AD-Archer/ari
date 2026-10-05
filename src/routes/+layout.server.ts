import { privateProvider } from '$private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => ({
	user: locals.user,
	privateOverlay: await privateProvider.appOverlayData(locals.user)
});
