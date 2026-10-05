import { createHash, randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';
import { mlog, tail4 } from '$lib/server/mcp/log';

export const mcpTokenPrefix = 'ari_mcp_';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// the raw value is returned once, only its hash is stored
export function generateMcpToken(): { raw: string; hash: string; last4: string } {
	const raw = mcpTokenPrefix + randomBytes(32).toString('base64url');
	return { raw, hash: sha256(raw), last4: raw.slice(-4) };
}

export function hashMcpToken(raw: string): string {
	return sha256(raw);
}

export interface McpContext {
	user: App.SessionUser;
	tokenId: string;
	tokenLabel: string;
	canWrite: boolean;
}

// owner permissions are re-checked on every call, so revoking either one kills the token
export async function validateMcpToken(raw: string): Promise<McpContext | null> {
	if (!raw.startsWith(mcpTokenPrefix)) {
		mlog('auth', 'reject: wrong prefix', { bearer: tail4(raw) });
		return null;
	}

	const token = await db.mcpToken.findUnique({
		where: { tokenHash: sha256(raw) },
		include: { user: { include: { memberships: { include: { program: true } } } } }
	});
	if (!token) {
		mlog('auth', 'reject: token not found', { bearer: tail4(raw) });
		return null;
	}
	if (token.revokedAt) {
		mlog('auth', 'reject: revoked', { token: token.label, last4: tail4(raw) });
		return null;
	}
	if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
		mlog('auth', 'reject: expired', {
			token: token.label,
			expiredAt: token.expiresAt.toISOString()
		});
		return null;
	}
	if (
		!token.user.orgPermissions.includes('MANAGE_MCP') ||
		!token.user.orgPermissions.includes('OPERATE_ALL_PROGRAMS')
	) {
		mlog('auth', 'reject: owner lacks MANAGE_MCP + OPERATE_ALL_PROGRAMS', {
			user: token.user.email,
			orgPermissions: token.user.orgPermissions.join(',')
		});
		return null;
	}
	mlog('auth', 'ok', { user: token.user.email, token: token.label, canWrite: token.canWrite });

	// 1 minute: 60 * 1000
	if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60000) {
		db.mcpToken
			.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
			.catch(() => {});
	}

	const user = token.user;
	return {
		tokenId: token.id,
		tokenLabel: token.label,
		canWrite: token.canWrite,
		user: {
			id: user.id,
			email: user.email,
			name: user.name,
			namePending: user.nameSource === 'PENDING',
			avatarColor: user.avatarColor,
			slackId: user.slackId,
			orgPermissions: user.orgPermissions,
			memberships: user.memberships.map((membership) => ({
				programId: membership.programId,
				permissions: membership.permissions,
				isPoc: membership.isPoc,
				tracks: membership.tracks
			}))
		}
	};
}
