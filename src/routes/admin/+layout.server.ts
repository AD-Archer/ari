import { error } from '@sveltejs/kit';
import { adminPagePermissions } from '$lib/adminNav';
import { requireUser, hasOrgPermission } from '$lib/server/authz';
import type { LayoutServerLoad } from './$types';

// any admin-page permission opens the frame. each page then requires its own
export const load: LayoutServerLoad = ({ locals }) => {
	const user = requireUser(locals);
	if (!adminPagePermissions.some((permission) => hasOrgPermission(user, permission)))
		throw error(403, 'You do not have permission to do this');
	return {};
};
