import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ago, whenLabel } from '$lib/server/serialize';
import {
	requireUser,
	requirePermission,
	hasPermission,
	hasOrgPermission,
	isAnyPoc
} from '$lib/server/authz';
import { systemUserId } from '$lib/server/systemUser';
import { serializeSessions, sessionDurationLabel } from '$lib/server/sessions';
import {
	parseTracks,
	parsePermissions,
	setMemberAccess,
	setMemberTracks,
	setMemberPermissions,
	removeMember
} from '$lib/server/members';
import { addReviewerNote, deleteReviewerNote, listReviewerNotes } from '$lib/server/reviewerNotes';
import {
	crossProgramStats,
	parseRange,
	rangeActive,
	reviewerOverview
} from '$lib/server/reviewerStats';
import type { PageServerLoad, Actions } from './$types';

// the target comes from the route, never a client-supplied email
const emailOf = async (userId: string): Promise<string> =>
	(await db.user.findUnique({ where: { id: userId }, select: { email: true } }))?.email ?? '';

export const load: PageServerLoad = async ({ params, parent, locals, url }) => {
	const { programId } = await parent();
	const viewer = requireUser(locals);
	// same gate as the roster: seeing a profile is seeing the reviewer list
	requirePermission(viewer, programId, 'VIEW_REVIEWERS');
	const canManage = hasPermission(viewer, programId, 'MANAGE_REVIEWERS');
	const orgOperator = hasOrgPermission(viewer, 'OPERATE_ALL_PROGRAMS');
	const canSeeNotes = isAnyPoc(viewer);

	const userId = params.userId;
	if (userId === systemUserId) throw error(404, 'Reviewer not found');

	// profiles are per-program: the subject must hold a membership on this one
	const membership = await db.membership.findUnique({
		where: { userId_programId: { userId, programId } },
		include: { user: true }
	});
	if (!membership) throw error(404, 'This person is not a reviewer on this program');
	const subject = membership.user;

	const range = parseRange(url.searchParams);
	const [overview, crossProgram, notes] = await Promise.all([
		reviewerOverview(programId, userId, range),
		crossProgramStats(viewer, userId, programId),
		listReviewerNotes(viewer, userId)
	]);

	return {
		subject: {
			id: subject.id,
			name: subject.name,
			email: subject.email,
			color: subject.avatarColor,
			slackId: subject.slackId,
			orgPermissions: subject.orgPermissions,
			lastSeen: ago(subject.lastSeenAt),
			isPoc: membership.isPoc,
			permissions: membership.permissions,
			tracks: membership.tracks
		},
		stats: {
			total: overview.stats.total,
			week: overview.stats.week,
			approvalPercent: overview.stats.approvalPercent,
			approvedSeconds: overview.stats.approvedSeconds,
			directTotal: overview.stats.directTotal,
			secondPass: overview.stats.secondPass,
			timeWorked: sessionDurationLabel(overview.stats.timeWorkedMs),
			sessionCount: overview.stats.sessionCount,
			vmCount: overview.stats.vmCount
		},
		sessions: serializeSessions(overview.sessions),
		recent: overview.recent.map((review) => ({
			id: review.id,
			submissionId: review.submissionId,
			title: review.title,
			track: review.track,
			thumb: review.thumb,
			decision: review.decision,
			approvedSeconds: review.approvedSeconds,
			when: whenLabel(review.createdAt),
			ago: `${ago(review.createdAt)} ago`
		})),
		vms: overview.vms.map((launch) => ({
			id: launch.id,
			type: launch.vmType,
			submissionId: launch.submissionId,
			title: launch.title ?? '(ship removed)',
			when: whenLabel(launch.createdAt),
			ago: `${ago(launch.createdAt)} ago`
		})),
		crossProgram,
		notes: (notes ?? []).map((note) => ({
			id: note.id,
			body: note.body,
			authorName: note.authorName,
			authorColor: note.authorColor,
			authorSlackId: note.authorSlackId,
			mine: note.authorId === viewer.id,
			when: whenLabel(note.createdAt),
			ago: `${ago(note.createdAt)} ago`
		})),
		canManage,
		orgOperator,
		canSeeNotes,
		range: { from: range.from, to: range.to, active: rangeActive(range) }
	};
};

export const actions: Actions = {
	tracks: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const email = await emailOf(params.userId);
		const tracks = parseTracks((await request.formData()).getAll('tracks').map(String));
		const result = await setMemberTracks(params.program, actor, email, tracks);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	permissions: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const email = await emailOf(params.userId);
		const permissions = parsePermissions(
			(await request.formData()).getAll('permissions').map(String)
		);
		const result = await setMemberPermissions(params.program, actor, email, permissions);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	access: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const email = await emailOf(params.userId);
		const form = await request.formData();
		const tracks = parseTracks(form.getAll('tracks').map(String));
		const permissions = parsePermissions(form.getAll('permissions').map(String));
		const result = await setMemberAccess(params.program, actor, email, tracks, permissions);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	remove: async ({ locals, params }) => {
		const actor = requireUser(locals);
		requirePermission(actor, params.program, 'MANAGE_REVIEWERS');
		const email = await emailOf(params.userId);
		const result = await removeMember(params.program, actor, email);
		return result.ok
			? { success: true, removed: true }
			: fail(result.status, { error: result.error });
	},

	addNote: async ({ request, locals, params }) => {
		const actor = requireUser(locals);
		const body = String((await request.formData()).get('body') ?? '');
		const result = await addReviewerNote(actor, params.userId, body);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	},

	deleteNote: async ({ request, locals }) => {
		const actor = requireUser(locals);
		const noteId = String((await request.formData()).get('id') ?? '');
		const result = await deleteReviewerNote(actor, noteId);
		return result.ok ? { success: true } : fail(result.status, { error: result.error });
	}
};
