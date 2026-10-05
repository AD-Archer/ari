import { error, fail, redirect } from '@sveltejs/kit';
import { validateMcpToken } from '$lib/server/mcp/auth';
import { issueAuthCode, baseUrl } from '$lib/server/mcp/oauth';
import { mlog } from '$lib/server/mcp/log';
import type { PageServerLoad, Actions } from './$types';

interface OauthParams {
	redirect_uri: string;
	state: string;
	code_challenge: string;
	code_challenge_method: string;
	scope: string;
	resource: string;
}

function readParams(source: URLSearchParams | FormData): OauthParams {
	const read = (key: string) => String(source.get(key) ?? '');
	return {
		redirect_uri: read('redirect_uri'),
		state: read('state'),
		code_challenge: read('code_challenge'),
		code_challenge_method: read('code_challenge_method'),
		scope: read('scope'),
		resource: read('resource')
	};
}

export const load: PageServerLoad = ({ url }) => {
	const params = readParams(url.searchParams);
	mlog('oauth', 'authorize GET (consent page)', {
		redirect_uri: params.redirect_uri,
		method: params.code_challenge_method,
		hasChallenge: !!params.code_challenge,
		hasState: !!params.state,
		scope: params.scope
	});
	if (params.code_challenge && params.code_challenge_method !== 'S256') {
		mlog('oauth', 'authorize GET → 400 (non-S256 challenge method)', {
			method: params.code_challenge_method
		});
		throw error(400, 'Only PKCE code_challenge_method=S256 is supported.');
	}
	if (!params.redirect_uri) {
		mlog('oauth', 'authorize GET → 400 (missing redirect_uri)');
		throw error(400, 'Missing redirect_uri.');
	}
	return { params };
};

// no session needed: the pasted mcp token is the credential
export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const params = readParams(form);
		const token = String(form.get('token') ?? '').trim();
		mlog('oauth', 'authorize POST (consent submit)', {
			redirect_uri: params.redirect_uri,
			hasToken: !!token
		});
		if (!params.redirect_uri) throw error(400, 'Missing redirect_uri.');

		const context = token ? await validateMcpToken(token) : null;
		if (!context) {
			mlog('oauth', 'authorize POST → rejected token (re-render with error)');
			return fail(400, {
				params,
				error: 'That token is invalid, revoked, or its owner lost MCP access.'
			});
		}

		const code = await issueAuthCode({
			userId: context.user.id,
			canWrite: context.canWrite,
			codeChallenge: params.code_challenge,
			redirectUri: params.redirect_uri
		});

		const destination = new URL(params.redirect_uri);
		destination.searchParams.set('code', code);
		if (params.state) destination.searchParams.set('state', params.state);
		destination.searchParams.set('iss', baseUrl(url.origin));
		mlog('oauth', 'authorize POST → 303 redirect with code', {
			to: destination.origin + destination.pathname,
			iss: baseUrl(url.origin)
		});
		throw redirect(303, destination.toString());
	}
};
