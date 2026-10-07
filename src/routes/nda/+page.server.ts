import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { forgetNdaStatus, ndaBlocks, ndaSignUrl, type NdaStatus } from '$lib/server/nda';
import { ndaStatus } from '$lib/server/ndaGate';
import type { Actions, PageServerLoad } from './$types';

// the session user does not carry the nda columns, so this page reads the row itself
const loadNdaUser = (locals: App.Locals) =>
	db.user.findUniqueOrThrow({
		where: { id: requireUser(locals).id },
		select: { id: true, email: true, slackId: true, ndaSignedAt: true, ndaCheckedAt: true }
	});

const stillBlockedMessage: Partial<Record<NdaStatus, string>> = {
	unsigned:
		"We still don't see a signature. It can take a minute to show up, so try again shortly.",
	noSlack: 'Link your Slack account in Hack Club Auth, then sign out and back in.',
	unknown: "We couldn't reach the NDA service. Try again in a moment."
};

export const load: PageServerLoad = async ({ locals }) => {
	const status = await ndaStatus(await loadNdaUser(locals));
	if (!ndaBlocks(status)) throw redirect(303, '/programs');
	return { status, signUrl: ndaSignUrl() };
};

export const actions: Actions = {
	recheck: async ({ locals }) => {
		const user = await loadNdaUser(locals);
		if (user.slackId) forgetNdaStatus(user.slackId);
		const status = await ndaStatus(user);
		if (!ndaBlocks(status)) throw redirect(303, '/programs');
		return fail(409, { message: stillBlockedMessage[status] ?? 'The NDA is still required.' });
	}
};
