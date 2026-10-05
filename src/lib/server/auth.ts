import { createHash, randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';
import { encrypt, decrypt } from '$lib/server/crypto';
import { env } from '$env/dynamic/private';
import type { Account } from '$db';

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

const defaultAuthBase = 'https://auth.hackclub.com';
const authBase = () => (env.HC_AUTH_BASE || defaultAuthBase).replace(/\/$/, '');

export const oauthConfigured = () => Boolean(env.HC_CLIENT_ID && env.HC_CLIENT_SECRET);

// no `name` scope: the provider reports the legal name, which can deadname
export const oauthScopes = 'openid profile email slack_id';
export const sessionCookie = 'ari_session';
export const stateCookie = 'ari_oauth_state';

export interface HcIdentity {
	id: string | null;
	email: string;
	slackId: string | null;
}

export interface HcTokens {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
	scope?: string;
}

export function buildAuthorizeUrl(state: string, options?: { prompt?: 'login' }): string {
	const authorizeUrl = new URL(authBase() + '/oauth/authorize');
	authorizeUrl.searchParams.set('client_id', env.HC_CLIENT_ID ?? '');
	authorizeUrl.searchParams.set('redirect_uri', env.HC_REDIRECT_URI ?? '');
	authorizeUrl.searchParams.set('response_type', 'code');
	authorizeUrl.searchParams.set('scope', oauthScopes);
	authorizeUrl.searchParams.set('state', state);
	if (options?.prompt) authorizeUrl.searchParams.set('prompt', options.prompt);
	return authorizeUrl.toString();
}

async function tokenRequest(body: Record<string, unknown>, label: string): Promise<HcTokens> {
	const response = await realFetch(authBase() + '/oauth/token', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_id: env.HC_CLIENT_ID,
			client_secret: env.HC_CLIENT_SECRET,
			...body
		})
	});
	if (!response.ok) throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
	return response.json();
}

export const exchangeCode = (code: string): Promise<HcTokens> =>
	tokenRequest(
		{ redirect_uri: env.HC_REDIRECT_URI, code, grant_type: 'authorization_code' },
		'token exchange'
	);

const refreshTokens = (refreshToken: string): Promise<HcTokens> =>
	tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, 'token refresh');

export async function fetchIdentity(accessToken: string): Promise<HcIdentity> {
	const response = await realFetch(authBase() + '/api/v1/me', {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!response.ok) {
		throw new Error(`identity fetch failed: ${response.status} ${await response.text()}`);
	}

	const { identity } = (await response.json()) as {
		identity?: { id?: string; primary_email?: string; slack_id?: string };
	};

	const email = identity?.primary_email;
	if (!email) throw new Error('identity response missing primary_email');

	return {
		id: identity?.id ?? null,
		email: email.toLowerCase(),
		slackId: identity?.slack_id ?? null
	};
}

export async function getValidAccessToken(account: Account): Promise<string> {
	// 1 minute: 60 * 1000
	if (account.expiresAt.getTime() > Date.now() + 60000) {
		return decrypt(account.accessTokenEnc);
	}
	const tokens = await refreshTokens(decrypt(account.refreshTokenEnc));
	await db.account.update({
		where: { id: account.id },
		data: {
			accessTokenEnc: encrypt(tokens.access_token),
			refreshTokenEnc: encrypt(tokens.refresh_token ?? decrypt(account.refreshTokenEnc)),
			scope: tokens.scope ?? account.scope,
			expiresAt: new Date(Date.now() + (tokens.expires_in ?? 0) * 1000) // seconds to ms
		}
	});
	return tokens.access_token;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(
	userId: string
): Promise<{ rawToken: string; expiresAt: Date }> {
	const rawToken = randomBytes(24).toString('base64url');
	const expiresAt = new Date(Date.now() + 2592000000); // 30 days: 30 * 24 * 60 * 60 * 1000
	await db.session.create({ data: { id: sha256(rawToken), userId, expiresAt } });
	return { rawToken, expiresAt };
}

export async function validateSession(rawToken: string) {
	const session = await db.session.findUnique({
		where: { id: sha256(rawToken) },
		include: { user: { include: { memberships: true } } }
	});
	if (!session) return null;
	if (session.expiresAt.getTime() < Date.now()) {
		await db.session.delete({ where: { id: session.id } }).catch(() => {});
		return null;
	}
	return session;
}

export type SessionWithUser = NonNullable<Awaited<ReturnType<typeof validateSession>>>;

export async function invalidateSession(rawToken: string): Promise<void> {
	await db.session.deleteMany({ where: { id: sha256(rawToken) } });
}
