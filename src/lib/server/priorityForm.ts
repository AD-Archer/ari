import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { encrypt, decrypt } from '$lib/server/crypto';
import type { Prisma } from '$db';

export const priorityIdentCookie = 'ari_priority_ident';

// site-wide, not /priority: the avatar proxy accepts a verified maker as its credential
const cookiePath = '/';
// the cookie used to live here. a lingering one shadows the site-wide cookie (the browser
// sends the more specific path first), so both writers evict it
const legacyCookiePath = '/priority';

// tokens are minted as 24 random bytes base64url. anything else is rejected before the db
export const formTokenPattern = /^[A-Za-z0-9_-]{16,128}$/;

export interface MakerIdentity {
	email: string;
	slackId: string | null;
	// slack display name, never the provider's legal name (it can deadname)
	name: string | null;
}

export function setMakerIdentityCookie(cookies: Cookies, identity: MakerIdentity): void {
	cookies.delete(priorityIdentCookie, { path: legacyCookiePath });
	// 1 hour: 60 * 60 * 1000
	const sealed = encrypt(JSON.stringify({ ...identity, exp: Date.now() + 3600000 }));
	cookies.set(priorityIdentCookie, sealed, {
		path: cookiePath,
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 3600 // 1 hour in seconds: 60 * 60
	});
}

export function clearMakerIdentityCookie(cookies: Cookies): void {
	cookies.delete(priorityIdentCookie, { path: cookiePath });
	cookies.delete(priorityIdentCookie, { path: legacyCookiePath });
}

// null when absent, expired or unreadable: a rotated key re-prompts instead of a 500
export function readMakerIdentity(cookies: Cookies): MakerIdentity | null {
	const sealed = cookies.get(priorityIdentCookie);
	if (!sealed) return null;
	try {
		const parsed = JSON.parse(decrypt(sealed)) as {
			email?: string;
			slackId?: string | null;
			name?: string | null;
			exp?: number;
		};
		if (!parsed.email || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
		return { email: parsed.email, slackId: parsed.slackId ?? null, name: parsed.name ?? null };
	} catch {
		return null;
	}
}

// what the form may show and mark: must never widen beyond the verified person
export function ownShipsWhere(identity: MakerIdentity): Prisma.SubmissionWhereInput {
	const ownShips: Prisma.SubmissionWhereInput[] = [
		{ maker: { email: { equals: identity.email, mode: 'insensitive' } } },
		{
			collaborators: {
				some: { maker: { email: { equals: identity.email, mode: 'insensitive' } } }
			}
		}
	];
	if (identity.slackId) {
		ownShips.push({ maker: { slackId: identity.slackId } });
		ownShips.push({ collaborators: { some: { maker: { slackId: identity.slackId } } } });
	}
	return { OR: ownShips };
}
