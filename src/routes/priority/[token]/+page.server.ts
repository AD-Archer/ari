import { fail } from '@sveltejs/kit';
import { readMakerIdentity, clearMakerIdentityCookie } from '$lib/server/priorityForm';
import { formProgram, loadPriorityForm, markPriority } from '$lib/server/priorityRequest';
import type { PageServerLoad, Actions } from './$types';

// public and reached by an unguessable token: there is no reviewer session here. every check
// lives in priorityRequest.ts, where the tests cover it
export const load: PageServerLoad = ({ params, cookies }) =>
	loadPriorityForm(params.token, readMakerIdentity(cookies));

export const actions: Actions = {
	mark: async ({ params, cookies, request }) => {
		const form = await request.formData();
		const result = await markPriority(
			params.token,
			readMakerIdentity(cookies),
			form.getAll('ship').map(String)
		);
		return result.ok
			? { ok: true, marked: result.marked }
			: fail(result.status, { error: result.error });
	},

	signout: async ({ params, cookies }) => {
		await formProgram(params.token);
		clearMakerIdentityCookie(cookies);
		return { ok: true };
	}
};
