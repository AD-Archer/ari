import { error, json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { renderReadme } from '$lib/server/readme';
import { assertCanView } from '$lib/server/review/guards';
import { fetchReadme } from '$lib/server/webhooks';

export const GET: RequestHandler = async ({ params, locals }) => {
	const programId = params.program ?? '';
	const submissionId = params.id ?? '';
	await assertCanView(locals.user, programId, submissionId);
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: { repoUrl: true }
	});
	if (!ship) throw error(404, 'Submission not found');

	// the service reads the readme live from the repository: this app only renders it
	const repo = await fetchReadme(submissionId);
	if (repo.ok)
		return json({ ok: true, html: renderReadme(repo.readme, { repoUrl: ship.repoUrl }) });
	return json({ ok: false, message: repo.message });
};
