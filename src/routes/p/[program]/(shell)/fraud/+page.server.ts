import { error } from '@sveltejs/kit';
import { privateProvider } from '$private';
import { requirePermission } from '$lib/server/authz';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { programId, permissions } = await parent();
	requirePermission(locals.user!, programId, 'VIEW_FRAUD');
	const view = await privateProvider.fraudPage(programId, {
		userId: locals.user!.id,
		permissions
	});
	if (!view) throw error(404, 'Not Found');
	return { view };
};
