import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requirePermission, requireUser } from '$lib/server/authz';
import { uploadImage } from '$lib/server/imageUpload';
import { loadSettings } from '$lib/server/settings/load';
import { saveSettings, type SettingsResult } from '$lib/server/settings/save';
import {
	revealIngestSecret,
	revealOutboundSecret,
	rollIngestSecret,
	rollOutboundSecret,
	type SecretResult
} from '$lib/server/settings/secrets';
import { archiveProgram, unarchiveProgram } from '$lib/server/settings/status';
import { saveTools } from '$lib/server/settings/tools';
import { sendTestOutbound, sendTestPing } from '$lib/server/settings/webhookTests';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { programId } = await parent();
	const user = requireUser(locals);
	requirePermission(user, programId, 'MANAGE_SETTINGS');
	return loadSettings(programId, user, url.origin);
};

async function guard(params: { program: string }, locals: App.Locals) {
	const user = requireUser(locals);
	const program = await db.program.findUnique({
		where: { id: params.program },
		select: { id: true }
	});
	if (!program) throw error(404, 'Program not found');
	requirePermission(user, program.id, 'MANAGE_SETTINGS');
	return { programId: program.id, user };
}

const saved = (result: SettingsResult) =>
	result.ok ? { success: true } : fail(result.status, { error: result.error });

const sent = (result: SettingsResult) =>
	result.ok ? { sent: true } : fail(result.status, { error: result.error });

const secret = (result: SecretResult) =>
	result.ok ? { plaintext: result.plaintext } : fail(result.status, { error: result.error });

export const actions: Actions = {
	save: async ({ params, locals, request }) => {
		const { programId, user } = await guard(params, locals);
		return saved(await saveSettings(programId, user, await request.formData()));
	},

	saveTools: async ({ params, locals, request }) => {
		const { programId, user } = await guard(params, locals);
		return saved(await saveTools(programId, user.id, await request.formData()));
	},

	uploadImage: async ({ params, locals, request }) => {
		await guard(params, locals);
		const result = await uploadImage((await request.formData()).get('file'));
		return result.ok ? { url: result.url } : fail(result.status, { error: result.error });
	},

	archive: async ({ params, locals }) => {
		const { programId, user } = await guard(params, locals);
		await archiveProgram(programId, user.id);
		return { success: true };
	},

	unarchive: async ({ params, locals }) => {
		const { programId, user } = await guard(params, locals);
		await unarchiveProgram(programId, user.id);
		return { success: true };
	},

	rollSecret: async ({ params, locals }) => {
		const { programId, user } = await guard(params, locals);
		return secret(await rollIngestSecret(programId, user.id));
	},

	revealSecret: async ({ params, locals }) => {
		const { programId } = await guard(params, locals);
		return secret(await revealIngestSecret(programId));
	},

	rollOutboundSecret: async ({ params, locals }) => {
		const { programId, user } = await guard(params, locals);
		return secret(await rollOutboundSecret(programId, user.id));
	},

	revealOutboundSecret: async ({ params, locals }) => {
		const { programId } = await guard(params, locals);
		return secret(await revealOutboundSecret(programId));
	},

	test: async ({ params, locals }) => {
		const { programId } = await guard(params, locals);
		return sent(await sendTestPing(programId));
	},

	testOutbound: async ({ params, locals }) => {
		const { programId } = await guard(params, locals);
		return sent(await sendTestOutbound(programId));
	}
};
