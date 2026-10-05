import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ago } from '$lib/server/serialize';
import { requirePermission, hasPermission, hasOrgPermission, requireUser } from '$lib/server/authz';
import { systemUserId } from '$lib/server/systemUser';
import {
	parsePermissions,
	parseTracks,
	permSummary,
	logMember,
	removeMember,
	setMemberAccess,
	setMemberTracks,
	setMemberPermissions
} from '$lib/server/members';
import { queueOrgChannelSync, queueReviewersChannelSync } from '$lib/server/slackChannels';
import type { Track } from '$db';
import type { PageServerLoad, Actions } from './$types';
import type { RosterRow } from './rosterTypes';

type Tally = { total: number; week: number; approved: number };
const emptyTally = (): Tally => ({ total: 0, week: 0, approved: 0 });

async function buildRoster(programId: string): Promise<RosterRow[]> {
	const since = new Date(Date.now() - 604800000); // 7 days: 7 * 24 * 60 * 60 * 1000

	const [memberships, invites, secondPassEvents, decisionGroups, weekGroups] = await Promise.all([
		db.membership.findMany({
			where: { programId, userId: { not: systemUserId } },
			include: { user: true },
			orderBy: { user: { name: 'asc' } }
		}),
		db.invite.findMany({
			where: { programId, acceptedAt: null },
			orderBy: { createdAt: 'asc' }
		}),
		// confirming a held decision edits the review in place, so an organizer's pass exists
		// only as an activity event
		db.activityEvent.findMany({
			where: {
				programId,
				kind: { in: ['APPROVED', 'CHANGES', 'REJECTED'] },
				OR: [
					{ meta: { path: ['op'], equals: 'second-pass-confirmed' } },
					{ meta: { path: ['op'], equals: 'second-pass-overridden' } }
				]
			},
			select: { actorId: true, kind: true, createdAt: true }
		}),
		db.review.groupBy({
			by: ['reviewerId', 'decision'],
			where: { submission: { programId } },
			_count: { _all: true }
		}),
		db.review.groupBy({
			by: ['reviewerId'],
			where: { submission: { programId }, createdAt: { gte: since } },
			_count: { _all: true }
		})
	]);

	const secondPass = new Map<string, Tally>();
	for (const event of secondPassEvents) {
		if (!event.actorId) continue;
		const tally = secondPass.get(event.actorId) ?? emptyTally();
		tally.total++;
		if (event.createdAt >= since) tally.week++;
		if (event.kind === 'APPROVED') tally.approved++;
		secondPass.set(event.actorId, tally);
	}

	const direct = new Map<string, Tally>();
	const directFor = (id: string) => {
		let tally = direct.get(id);
		if (!tally) direct.set(id, (tally = emptyTally()));
		return tally;
	};
	for (const group of decisionGroups) {
		const tally = directFor(group.reviewerId);
		tally.total += group._count._all;
		if (group.decision === 'approved') tally.approved += group._count._all;
	}
	for (const group of weekGroups) directFor(group.reviewerId).week = group._count._all;

	const members: RosterRow[] = memberships.map((membership) => {
		const own = direct.get(membership.userId) ?? emptyTally();
		const confirmed = secondPass.get(membership.userId) ?? emptyTally();
		const total = own.total + confirmed.total;
		const approvedCount = own.approved + confirmed.approved;
		return {
			userId: membership.userId,
			name: membership.user.name,
			email: membership.user.email,
			permissions: membership.permissions,
			isPoc: membership.isPoc,
			tracks: membership.tracks,
			color: membership.user.avatarColor,
			slackId: membership.user.slackId,
			total,
			week: own.week + confirmed.week,
			approvalPercent: total > 0 ? Math.round((approvedCount / total) * 100) : 0,
			lastSeen: ago(membership.user.lastSeenAt),
			pending: false
		};
	});

	// a stale invite for someone who already has a membership must not list them twice
	const memberEmails = new Set(members.map((member) => member.email.toLowerCase()));
	const invited: RosterRow[] = invites
		.filter((invite) => !memberEmails.has(invite.email.toLowerCase()))
		.map((invite) => ({
			userId: null,
			name: invite.email.split('@')[0],
			email: invite.email,
			permissions: invite.permissions,
			isPoc: false,
			tracks: invite.tracks,
			color: 'var(--text-3)',
			slackId: null,
			total: 0,
			week: 0,
			approvalPercent: 0,
			lastSeen: 'Invited',
			pending: true
		}));

	return [...members, ...invited];
}

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { programId, meta } = await parent();
	const viewer = requireUser(locals);
	requirePermission(viewer, programId, 'VIEW_REVIEWERS');
	const canManage = hasPermission(viewer, programId, 'MANAGE_REVIEWERS');

	const reviewers = buildRoster(programId);
	// streamed: a rejection must not surface before the page has subscribed
	reviewers.catch(() => {});

	return {
		reviewers,
		goal: meta.reviewGoal,
		canManage,
		// the server only lets an org operator touch the program poc
		orgOperator: hasOrgPermission(viewer, 'OPERATE_ALL_PROGRAMS')
	};
};

// the target comes from a user id, never a client-supplied email
const emailOf = async (userId: string): Promise<string> =>
	userId
		? ((await db.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? '')
		: '';

export const actions: Actions = {
	add: async ({ request, locals, params }) => {
		const program = await db.program.findUniqueOrThrow({
			where: { id: params.program },
			select: { id: true }
		});
		const actor = requireUser(locals);
		requirePermission(actor, program.id, 'MANAGE_REVIEWERS');

		const form = await request.formData();
		const permissions = parsePermissions(form.getAll('permissions').map(String));
		const tracksPicked = parseTracks(form.getAll('tracks').map(String));
		const tracks: Track[] = tracksPicked.length ? tracksPicked : ['software'];

		const raw = form.getAll('emails').map(String);
		if (!raw.length) raw.push(String(form.get('email') ?? ''));
		const emails = [
			...new Set(
				raw.map((entry) => entry.trim().toLowerCase()).filter((entry) => /.+@.+\..+/.test(entry))
			)
		];
		if (!emails.length) return fail(400, { error: 'At least one valid email is required.' });

		let added = 0;
		for (const email of emails) {
			// case-insensitive: a user row keeps the provider's case, and an exact match would
			// stack an invite that person can never accept
			const user = await db.user.findFirst({
				where: { email: { equals: email, mode: 'insensitive' } }
			});
			if (user?.id === systemUserId) continue;
			if (user) {
				const existing = await db.membership.findUnique({
					where: { userId_programId: { userId: user.id, programId: program.id } }
				});
				if (!existing) {
					await db.membership.create({
						data: { userId: user.id, programId: program.id, permissions, tracks }
					});
					await logMember(program.id, actor.id, 'added', email, permSummary(permissions));
					queueOrgChannelSync(user.id);
					queueReviewersChannelSync(program.id, user.id, 'add');
					added++;
				}
				// invites are only consumed at first login, so the membership fulfils this one
				await db.invite.updateMany({
					where: {
						email: { equals: email, mode: 'insensitive' },
						programId: program.id,
						acceptedAt: null
					},
					data: { acceptedAt: new Date() }
				});
			} else {
				const pending = await db.invite.findFirst({
					where: { email, programId: program.id, acceptedAt: null }
				});
				if (pending) {
					await db.invite.update({ where: { id: pending.id }, data: { permissions, tracks } });
				} else {
					await db.invite.create({ data: { email, programId: program.id, permissions, tracks } });
					await logMember(program.id, actor.id, 'invited', email, permSummary(permissions));
				}
				added++;
			}
		}
		return { success: true, added };
	},

	remove: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const email = String((await request.formData()).get('email') ?? '').trim();
		const result = await removeMember(params.program, actor, email);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	tracks: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const form = await request.formData();
		const email = await emailOf(String(form.get('userId') ?? ''));
		const tracks = parseTracks(form.getAll('tracks').map(String));
		const result = await setMemberTracks(params.program, actor, email, tracks);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	permissions: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const form = await request.formData();
		const email = await emailOf(String(form.get('userId') ?? ''));
		const permissions = parsePermissions(form.getAll('permissions').map(String));
		const result = await setMemberPermissions(params.program, actor, email, permissions);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	access: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const form = await request.formData();
		const email = await emailOf(String(form.get('userId') ?? ''));
		const tracks = parseTracks(form.getAll('tracks').map(String));
		const permissions = parsePermissions(form.getAll('permissions').map(String));
		const result = await setMemberAccess(params.program, actor, email, tracks, permissions);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	}
};
