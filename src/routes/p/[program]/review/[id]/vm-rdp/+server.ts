import { error, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { rdpFile, rdpHostFromUri } from '$lib/server/vm';

// keyed by the caller, so a reviewer only ever fetches their own vm's file
export const GET: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	if (!user) throw error(401, 'Sign in first');

	const row = await db.reviewerVm.findUnique({
		where: { submissionId_reviewerId: { submissionId: params.id ?? '', reviewerId: user.id } },
		select: { name: true, rdpUri: true }
	});
	// android vms are browser-only
	if (!row?.rdpUri) throw error(404, 'No RDP VM for this ship');
	const host = rdpHostFromUri(row.rdpUri);
	if (!host) throw error(404, 'VM has no RDP address');

	const rawUsername = row.rdpUri.match(/username=s:([^&]+)/)?.[1];
	const username = rawUsername ? decodeURIComponent(rawUsername) : 'reviewer';
	const filename = `${row.name.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'review'}.rdp`;

	return new Response(rdpFile(host, username), {
		headers: {
			'Content-Type': 'application/x-rdp; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
