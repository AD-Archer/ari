import { fail, redirect } from '@sveltejs/kit';
import { visibleAdminSections } from '$lib/adminNav';
import { hasOrgPermission, requireOrgPermission, requireUser } from '$lib/server/authz';
import { loadProgramBoard } from '$lib/server/programBoard';
import { createInputFrom, updateInputFrom } from '$lib/server/programInput';
import { createProgram, updateProgram, verifyReviewersChannel } from '$lib/server/programs';
import { archiveProgram, reingestProgram, unarchiveProgram } from '$lib/server/programStatus';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	// someone whose only admin grant is another page still lands here from the nav
	if (!hasOrgPermission(user, 'CREATE_PROGRAMS')) {
		const [firstSection] = visibleAdminSections(user.orgPermissions);
		throw redirect(303, firstSection?.href ?? '/programs');
	}
	return loadProgramBoard(user);
};

// the layout load does not run for form actions, so each one gates itself
export const actions: Actions = {
	create: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'CREATE_PROGRAMS');
		const result = await createProgram(actor, createInputFrom(await request.formData()));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { id: result.id };
	},

	checkChannel: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'CREATE_PROGRAMS');
		const form = await request.formData();
		const result = await verifyReviewersChannel(actor, String(form.get('channel') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { id: result.id, name: result.name, unverified: result.unverified };
	},

	reingest: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'MANAGE_PROGRAMS');
		const form = await request.formData();
		const result = await reingestProgram(actor, String(form.get('programId') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { queued: result.queued };
	},

	archive: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'MANAGE_PROGRAMS');
		const form = await request.formData();
		const result = await archiveProgram(actor, String(form.get('programId') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { success: true };
	},

	update: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'MANAGE_PROGRAMS');
		const result = await updateProgram(actor, updateInputFrom(await request.formData()));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { success: true };
	},

	unarchive: async ({ request, locals }) => {
		const actor = requireOrgPermission(locals, 'MANAGE_PROGRAMS');
		const form = await request.formData();
		const result = await unarchiveProgram(actor, String(form.get('programId') ?? ''));
		if (!result.ok) return fail(result.status, { error: result.error });
		return { success: true };
	}
};
