import { json, type RequestHandler } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { mlog } from '$lib/server/mcp/log';

// public client (pkce, no secret): nothing is persisted and the token endpoint ignores client_id
export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown> = {};
	try {
		body = await request.json();
	} catch {
		// an empty registration body is fine
	}
	const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
	const clientId = `ari-mcp-${randomBytes(8).toString('hex')}`;
	mlog('oauth', 'register (DCR)', {
		client_name: body.client_name ?? '',
		redirect_uris: redirectUris,
		client_id: clientId
	});
	return json(
		{
			client_id: clientId,
			client_id_issued_at: Math.floor(Date.now() / 1000), // ms to unix seconds
			redirect_uris: redirectUris,
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code'],
			response_types: ['code'],
			client_name: typeof body.client_name === 'string' ? body.client_name : 'MCP Client'
		},
		{ status: 201 }
	);
};
