import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { requireOrgPermission } from '$lib/server/authz';
import { generateMcpToken } from '$lib/server/mcp/auth';
import { baseUrl } from '$lib/server/mcp/oauth';
import { descendantTokenIds, revokeTokenTree } from '$lib/server/mcp/tokenLineage';
import { ago } from '$lib/server/serialize';
import type { PageServerLoad, Actions } from './$types';

function tokenState(token: { revokedAt: Date | null; expiresAt: Date | null }) {
	if (token.revokedAt) return 'revoked' as const;
	if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return 'expired' as const;
	return 'active' as const;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireOrgPermission(locals, 'MANAGE_MCP');
	const rows = await db.mcpToken.findMany({
		orderBy: { createdAt: 'desc' },
		include: {
			user: { select: { name: true, email: true, avatarColor: true } },
			parentToken: { select: { label: true, last4: true } }
		}
	});
	return {
		endpoint: `${baseUrl(url.origin)}/api/mcp`,
		tokens: rows.map((token) => ({
			id: token.id,
			label: token.label,
			last4: token.last4,
			owner: token.user.name,
			ownerEmail: token.user.email,
			ownerColor: token.user.avatarColor,
			canWrite: token.canWrite,
			state: tokenState(token),
			created: ago(token.createdAt),
			lastUsed: token.lastUsedAt ? ago(token.lastUsedAt) : null,
			expires: token.expiresAt ? token.expiresAt.toISOString().slice(0, 10) : null,
			parent: token.parentToken ? `${token.parentToken.label} (…${token.parentToken.last4})` : null
		}))
	};
};

export const actions: Actions = {
	// the raw value is returned once here and never stored: only its hash lands in the database
	mint: async ({ locals, request }) => {
		const actor = requireOrgPermission(locals, 'MANAGE_MCP');
		const form = await request.formData();

		const label =
			String(form.get('label') ?? '').trim() ||
			`${actor.name} (${new Date().toISOString().slice(0, 10)})`;
		const daysRaw = String(form.get('days') ?? '').trim();
		const days = daysRaw ? Number(daysRaw) : null;
		if (days !== null && (!Number.isFinite(days) || days <= 0)) {
			return fail(400, { error: 'Expiry must be a positive number of days.' });
		}
		const canWrite = form.get('canWrite') === 'on';

		const { raw, hash, last4 } = generateMcpToken();
		// ms in a day: 24 * 60 * 60 * 1000
		const expiresAt = days !== null ? new Date(Date.now() + days * 86400000) : null;

		await db.mcpToken.create({
			data: { tokenHash: hash, userId: actor.id, label, last4, expiresAt, canWrite }
		});

		return { minted: true, token: raw, label };
	},

	// the row is kept for audit and fails closed on the next request. tokens minted through
	// the oauth flow with this one go with it
	revoke: async ({ locals, request }) => {
		requireOrgPermission(locals, 'MANAGE_MCP');
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'No token id.' });
		const token = await db.mcpToken.findUnique({ where: { id }, select: { id: true } });
		if (!token) return fail(404, { error: 'No such token.' });
		await revokeTokenTree(id);
		return { success: true };
	},

	delete: async ({ locals, request }) => {
		requireOrgPermission(locals, 'MANAGE_MCP');
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { error: 'No token id.' });
		// deleting the parent nulls the children's link, so they are revoked first
		const children = await descendantTokenIds(id);
		await db.mcpToken.updateMany({
			where: { id: { in: children }, revokedAt: null },
			data: { revokedAt: new Date() }
		});
		await db.mcpToken.deleteMany({ where: { id } });
		return { success: true };
	}
};
