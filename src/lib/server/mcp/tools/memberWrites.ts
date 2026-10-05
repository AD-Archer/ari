import { db } from '$lib/server/db';
import { systemUserId } from '$lib/server/systemUser';
import { hasOrgPermission } from '$lib/server/authz';
import { allOrgPermissions, allPermissions, allTracks } from '$lib/data';
import { permSummary } from '$lib/server/members';
import { queueOrgChannelSync, queueReviewersChannelSync } from '$lib/server/slackChannels';
import type { OrgPermission, ProgramPermission, Track } from '$db';
import { requireWrite, resolveProgram, type Tool } from './shared';

function parseTracks(input: unknown): Track[] {
	if (!Array.isArray(input)) return ['software'];
	const tracks = input.filter((entry): entry is Track => allTracks.includes(entry as Track));
	return tracks.length ? [...new Set(tracks)] : ['software'];
}

function parsePermissions(input: unknown): ProgramPermission[] {
	if (!Array.isArray(input)) return [];
	return allPermissions.filter((permission) => input.includes(permission));
}

export const addMember: Tool = {
	spec: {
		name: 'add_member',
		description:
			'(write) Add a member to a program with an optional set of permissions (empty = plain reviewer). Existing users get a membership immediately; people who have never signed in get an invite that activates on first login. Optionally set track scope.',
		inputSchema: {
			type: 'object',
			properties: {
				program: { type: 'string', description: 'Program id.' },
				email: { type: 'string' },
				permissions: {
					type: 'array',
					items: { type: 'string', enum: allPermissions },
					description: 'Program permissions to grant (default none = plain reviewer).'
				},
				tracks: {
					type: 'array',
					items: { type: 'string', enum: ['software', 'hardware'] },
					description: 'Track scope for the member (default ["software"]).'
				}
			},
			required: ['program', 'email'],
			additionalProperties: false
		}
	},
	write: true,
	handler: async (args, context) => {
		requireWrite(context);
		const program = await resolveProgram(String(args.program));
		const email = String(args.email).trim().toLowerCase();
		if (!email) throw new Error('email is required.');
		const permissions = parsePermissions(args.permissions);
		const tracks = parseTracks(args.tracks);
		const summary = permSummary(permissions);

		// stored emails keep the identity provider's casing: an exact match would stack an
		// invite that person can never accept
		const existing = await db.user.findFirst({
			where: { email: { equals: email, mode: 'insensitive' } },
			select: { id: true }
		});
		if (existing?.id === systemUserId) throw new Error('The system account cannot join programs.');

		if (existing) {
			const membershipKey = { userId_programId: { userId: existing.id, programId: program.id } };
			const previous = await db.membership.findUnique({
				where: membershipKey,
				select: { id: true }
			});
			await db.membership.upsert({
				where: membershipKey,
				create: { userId: existing.id, programId: program.id, permissions, tracks },
				update: { permissions, tracks }
			});
			// the membership fulfils any pending invite, which could never be accepted at login
			await db.invite.updateMany({
				where: {
					email: { equals: email, mode: 'insensitive' },
					programId: program.id,
					acceptedAt: null
				},
				data: { acceptedAt: new Date() }
			});
			if (!previous) {
				queueOrgChannelSync(existing.id);
				queueReviewersChannelSync(program.id, existing.id, 'add');
			}
			await db.activityEvent.create({
				data: {
					programId: program.id,
					kind: 'MEMBER',
					actorId: context.user.id,
					text: previous ? `Set ${email} to ${summary}` : `Added ${email} with ${summary}`,
					meta: {
						op: previous ? 'permissions-changed' : 'added',
						email,
						permissions,
						via: 'mcp'
					}
				}
			});
			return {
				result: previous ? 'updated' : 'added',
				email,
				program: program.id,
				permissions,
				tracks
			};
		}

		const pendingInvite = await db.invite.findFirst({
			where: { email, programId: program.id, acceptedAt: null }
		});
		if (!pendingInvite) {
			await db.invite.create({
				data: { email, programId: program.id, permissions, tracks }
			});
			await db.activityEvent.create({
				data: {
					programId: program.id,
					kind: 'MEMBER',
					actorId: context.user.id,
					text: `Invited ${email} with ${summary}`,
					meta: { op: 'invited', email, permissions, via: 'mcp' }
				}
			});
		}
		return {
			result: pendingInvite ? 'already-invited' : 'invited',
			email,
			program: program.id,
			permissions,
			tracks
		};
	}
};

export const removeMember: Tool = {
	spec: {
		name: 'remove_member',
		description:
			"(write) Remove a person's membership from one program. Does not delete their account or other-program access; pending invites for that program are revoked too.",
		inputSchema: {
			type: 'object',
			properties: {
				program: { type: 'string', description: 'Program id.' },
				email: { type: 'string' }
			},
			required: ['program', 'email'],
			additionalProperties: false
		}
	},
	write: true,
	handler: async (args, context) => {
		requireWrite(context);
		const program = await resolveProgram(String(args.program));
		const email = String(args.email).trim().toLowerCase();
		const user = await db.user.findFirst({
			where: { email: { equals: email, mode: 'insensitive' } },
			select: { id: true }
		});
		let removed = false;
		if (user) {
			const deletedMemberships = await db.membership.deleteMany({
				where: { userId: user.id, programId: program.id }
			});
			removed = deletedMemberships.count > 0;
			if (removed) {
				queueReviewersChannelSync(program.id, user.id, 'remove');
				queueOrgChannelSync(user.id);
			}
		}
		const deletedInvites = await db.invite.deleteMany({
			where: {
				email: { equals: email, mode: 'insensitive' },
				programId: program.id,
				acceptedAt: null
			}
		});
		if (removed || deletedInvites.count > 0) {
			await db.activityEvent.create({
				data: {
					programId: program.id,
					kind: 'MEMBER',
					actorId: context.user.id,
					text: `Removed ${email}`,
					meta: { op: 'removed', email, via: 'mcp' }
				}
			});
		}
		return { removed: removed || deletedInvites.count > 0, email, program: program.id };
	}
};

export const setOrgPermissions: Tool = {
	spec: {
		name: 'set_org_permissions',
		description:
			"(write) Replace a user's org permissions. The token owner must hold GRANT_ORG_PERMS, cannot change their own set, and can only add permissions they hold themselves (revoking is unrestricted).",
		inputSchema: {
			type: 'object',
			properties: {
				email: { type: 'string' },
				permissions: {
					type: 'array',
					items: { type: 'string', enum: allOrgPermissions },
					description: 'The complete new permission set (empty array = plain member).'
				}
			},
			required: ['email', 'permissions'],
			additionalProperties: false
		}
	},
	write: true,
	handler: async (args, context) => {
		requireWrite(context);
		if (!hasOrgPermission(context.user, 'GRANT_ORG_PERMS')) {
			throw new Error('The token owner does not hold GRANT_ORG_PERMS.');
		}
		const email = String(args.email).trim().toLowerCase();
		if (email === context.user.email.toLowerCase()) {
			throw new Error("You can't change your own org permissions.");
		}
		const requested = Array.isArray(args.permissions) ? args.permissions.map(String) : [];
		const unknown = requested.filter(
			(entry) => !allOrgPermissions.includes(entry as OrgPermission)
		);
		if (unknown.length) {
			throw new Error(`Unknown org permissions: ${unknown.join(', ')}.`);
		}
		const permissions = allOrgPermissions.filter((permission) => requested.includes(permission));
		const user = await db.user.findUnique({
			where: { email },
			select: { id: true, orgPermissions: true }
		});
		if (!user) throw new Error('No account with that email has signed in yet.');
		if (user.id === systemUserId) throw new Error("The system account's permissions can't change.");
		const added = permissions.filter((permission) => !user.orgPermissions.includes(permission));
		if (added.some((permission) => !hasOrgPermission(context.user, permission))) {
			throw new Error('You can only grant org permissions you hold yourself.');
		}
		if ([...user.orgPermissions].sort().join(',') !== [...permissions].sort().join(',')) {
			await db.user.update({ where: { id: user.id }, data: { orgPermissions: permissions } });
		}
		return { email, orgPermissions: permissions };
	}
};
