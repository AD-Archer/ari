import { randomBytes } from 'node:crypto';
import { privateProvider } from '$private';
import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { generateSecret } from '$lib/server/webhookSecrets';
import { allPermissions } from '$lib/data';
import {
	channelFormatMessage,
	nameProblem,
	parseEmails,
	parseEvidence,
	reauthTtlProblem,
	reviewGoalProblem,
	trackingStartDate,
	trackingStartProblem,
	wholeNumber
} from '$lib/programRules';
import {
	channelLinkerProblem,
	channelStatus,
	parseChannelId,
	queueOrgChannelSync,
	queueReviewersChannelBackfill,
	queueReviewersChannelSync,
	type ChannelStatus
} from '$lib/server/slackChannels';
import type { Prisma } from '$db';

export type ProgramResult<Data> =
	| ({ ok: true } & Data)
	| { ok: false; status: number; error: string };

export const refuse = (status: number, error: string) => ({ ok: false as const, status, error });

export const notPermitted = () => refuse(403, 'You do not have permission to do this');

// the organizer tier is found by its defining capability
export const organizerFilter = { permissions: { has: 'MANAGE_SETTINGS' as const } };

// no_token passes: without slack configured there is nothing to verify against
function channelProblem(status: ChannelStatus): string | null {
	switch (status.state) {
		case 'in_channel':
		case 'no_token':
			return null;
		case 'not_in_channel':
			return `The Ari Slack App is not in ${status.name ? `#${status.name}` : 'that channel'} yet. Run /invite @Ari Services there, then check again.`;
		case 'not_found':
			return "Ari can't see that channel. Check the id, and for a private channel run /invite @Ari Services there first.";
		default:
			return `Slack could not be reached to check the channel (${status.error}). Try again.`;
	}
}

export interface VerifiedChannel {
	id: string;
	name: string | null;
	unverified: boolean;
}

// shared by the live check and the create validation so they cannot disagree
export async function verifyReviewersChannel(
	actor: App.SessionUser,
	raw: string
): Promise<ProgramResult<VerifiedChannel>> {
	if (!hasOrgPermission(actor, 'CREATE_PROGRAMS')) return notPermitted();
	const id = parseChannelId(raw.trim());
	if (!id) return refuse(400, channelFormatMessage());
	const status = await channelStatus(id);
	const problem = channelProblem(status);
	if (problem) return refuse(400, problem);
	const name = 'name' in status ? status.name : null;
	// only someone in the channel may link it as their program's
	const linkerProblem = await channelLinkerProblem(id, actor.slackId, name);
	if (linkerProblem) return refuse(400, linkerProblem);
	return { ok: true, id, name, unverified: status.state === 'no_token' };
}

export interface CreateProgramInput {
	name: string;
	accent: string;
	evidence: string[];
	allowVms: boolean;
	secondPass: boolean;
	organizers: string[];
	poc: string;
	reviewersChannel: string;
	trackingStartsAt: string;
	cantReviewOwn: boolean;
	allowDeflation: boolean;
	hoursJustification: boolean;
	secondPassApproved: boolean;
	secondPassChanges: boolean;
	secondPassRejected: boolean;
	secondPassOrganizerBypass: boolean;
	priorityReview: boolean;
	reviewerReauth: boolean;
	reviewerReauthTtlMinutes: string;
	reviewGoal: string;
	stepValues: Record<string, string>;
}

export async function createProgram(
	actor: App.SessionUser,
	input: CreateProgramInput
): Promise<ProgramResult<{ id: string }>> {
	if (!hasOrgPermission(actor, 'CREATE_PROGRAMS')) return notPermitted();
	const canManage = hasOrgPermission(actor, 'MANAGE_PROGRAMS');
	const name = input.name.trim();
	const accent = input.accent.trim();
	const missingName = nameProblem(name);
	if (missingName) return refuse(400, missingName);

	const accepts = parseEvidence(input.evidence);
	if (input.allowVms && !canManage)
		return refuse(403, 'Only people who can manage programs can turn on reviewer VMs.');

	const organizers = parseEmails(input.organizers);
	let poc = input.poc.trim().toLowerCase();
	// the create-only tier is pinned to itself as organizer and poc, whatever the form said
	if (!canManage) {
		const own = actor.email.toLowerCase();
		if (!organizers.includes(own)) organizers.push(own);
		poc = own;
	}

	const channel = await verifyReviewersChannel(actor, input.reviewersChannel);
	if (!channel.ok) return channel;
	const reviewersChannelId = channel.id;

	const rawTrackingStart = input.trackingStartsAt.trim();
	const trackingProblem = trackingStartProblem(rawTrackingStart);
	if (trackingProblem) return refuse(400, trackingProblem);
	const trackingStartsAt = trackingStartDate(rawTrackingStart);

	const hoursJustification = canManage ? input.hoursJustification : true;
	const reviewerReauthTtl = wholeNumber(input.reviewerReauthTtlMinutes);
	const ttlProblem = reauthTtlProblem(input.reviewerReauth, reviewerReauthTtl);
	if (ttlProblem) return refuse(400, ttlProblem);
	const reviewGoal = wholeNumber(input.reviewGoal);
	const goalProblem = reviewGoalProblem(reviewGoal);
	if (goalProblem) return refuse(400, goalProblem);

	const secret = generateSecret();
	const syncUserIds: string[] = [];
	const program = await db.$transaction(async (transaction) => {
		const created = await transaction.program.create({
			data: {
				name,
				color: accent || '#ec3750',
				accepts,
				allowVms: input.allowVms,
				secondPass: input.secondPass,
				secondPassApproved: input.secondPassApproved,
				secondPassChanges: input.secondPassChanges,
				secondPassRejected: input.secondPassRejected,
				secondPassOrganizerBypass: input.secondPassOrganizerBypass,
				reviewersChannelId,
				trackingStartsAt,
				reviewersCannotReviewOwnProjects: input.cantReviewOwn,
				allowDeflation: input.allowDeflation,
				hoursJustification,
				priorityReview: input.priorityReview,
				// minted up front so the public form link exists as soon as settings renders it
				// 24 random bytes: 32 base64url characters
				priorityReviewToken: input.priorityReview ? randomBytes(24).toString('base64url') : null,
				reviewerReauth: input.reviewerReauth,
				reviewerReauthTtlMinutes:
					Number.isInteger(reviewerReauthTtl) && reviewerReauthTtl >= 1 ? reviewerReauthTtl : 60, // 60 minutes: the schema default
				weeklyReviewGoal: reviewGoal,
				status: 'ACTIVE',
				webhookSecrets: { create: { secretEnc: secret.secretEnc, last4: secret.last4 } }
			}
		});
		const flags = await privateProvider.programCreated({
			programId: created.id,
			values: input.stepValues,
			transaction
		});

		for (const email of organizers) {
			// user emails keep the identity provider's casing: an exact match would hand an existing
			// user an invite they can never accept
			const user = await transaction.user.findFirst({
				where: { email: { equals: email, mode: 'insensitive' } }
			});
			if (user) {
				// a fresh program has no prior poc to demote
				const isPoc = poc !== '' && email === poc;
				await transaction.membership.upsert({
					where: { userId_programId: { userId: user.id, programId: created.id } },
					create: { userId: user.id, programId: created.id, permissions: allPermissions, isPoc },
					update: { permissions: allPermissions, isPoc }
				});
				syncUserIds.push(user.id);
			} else {
				await transaction.invite.create({
					data: { email, programId: created.id, permissions: allPermissions }
				});
			}
		}

		await transaction.activityEvent.create({
			data: {
				programId: created.id,
				kind: 'SETTINGS',
				actorId: actor.id,
				text: `Program ${created.name} created`,
				meta: {
					event: 'program_created',
					name: created.name,
					accepts,
					organizers,
					reviewersChannelId,
					trackingStartsAt: rawTrackingStart,
					flags
				}
			}
		});
		return created;
	});
	queueOrgChannelSync(...syncUserIds);
	queueReviewersChannelBackfill(program.id);
	return { ok: true, id: program.id };
}

// at most one poc per program: the prior holder is cleared in the caller's transaction. a pick
// with no membership here leaves the program without one until they join
export async function setPoc(
	transaction: Prisma.TransactionClient,
	programId: string,
	pocEmail: string
): Promise<string | null> {
	await transaction.membership.updateMany({
		where: { programId, isPoc: true },
		data: { isPoc: false }
	});
	if (pocEmail === '') return null;
	const pocUser = await transaction.user.findFirst({
		where: { email: { equals: pocEmail, mode: 'insensitive' } },
		select: { id: true }
	});
	if (!pocUser) return null;
	await transaction.membership.updateMany({
		where: { userId: pocUser.id, programId },
		data: { isPoc: true }
	});
	return pocUser.id;
}

export interface UpdateProgramInput {
	programId: string;
	name: string;
	accent: string;
	evidence: string[];
	allowVms: boolean;
	secondPass: boolean;
	organizers: string[];
	poc: string;
}

export async function updateProgram(
	actor: App.SessionUser,
	input: UpdateProgramInput
): Promise<ProgramResult<object>> {
	if (!hasOrgPermission(actor, 'MANAGE_PROGRAMS')) return notPermitted();
	const programId = input.programId.trim();
	const name = input.name.trim();
	const accent = input.accent.trim();
	const poc = input.poc.trim().toLowerCase();
	if (!programId) return refuse(400, 'No program specified.');
	const missingName = nameProblem(name);
	if (missingName) return refuse(400, missingName);

	const program = await db.program.findUnique({ where: { id: programId }, select: { id: true } });
	if (!program) return refuse(404, 'Program not found.');

	const accepts = parseEvidence(input.evidence);
	const { allowVms, secondPass } = input;
	const desired = new Set(parseEmails(input.organizers));

	// the prior poc is read separately: their membership may hold no explicit permissions
	const [currentMemberships, currentInvites, priorPoc] = await Promise.all([
		db.membership.findMany({
			where: { programId, ...organizerFilter },
			select: { id: true, userId: true, user: { select: { email: true } } }
		}),
		db.invite.findMany({
			where: { programId, ...organizerFilter, acceptedAt: null },
			select: { id: true, email: true }
		}),
		db.membership.findFirst({ where: { programId, isPoc: true }, select: { userId: true } })
	]);
	const haveMember = new Set(
		currentMemberships.map((membership) => membership.user.email.toLowerCase())
	);
	const haveInvite = new Set(currentInvites.map((invite) => invite.email.toLowerCase()));

	const removedUserIds: string[] = [];
	const addedUserIds: string[] = [];
	let newPocId: string | null = null;
	await db.$transaction(async (transaction) => {
		// a blank accent leaves the colour untouched
		await transaction.program.update({
			where: { id: programId },
			data: { name, color: accent || undefined, accepts, allowVms, secondPass }
		});
		for (const membership of currentMemberships)
			if (!desired.has(membership.user.email.toLowerCase())) {
				await transaction.membership.delete({ where: { id: membership.id } });
				removedUserIds.push(membership.userId);
			}
		for (const invite of currentInvites)
			if (!desired.has(invite.email.toLowerCase()))
				await transaction.invite.delete({ where: { id: invite.id } });
		// a pending invite does not skip an existing user: invites are only consumed at first login,
		// so for someone already signed in it would stay pending forever
		for (const email of desired) {
			if (haveMember.has(email)) continue;
			const user = await transaction.user.findFirst({
				where: { email: { equals: email, mode: 'insensitive' } },
				select: { id: true }
			});
			if (user) {
				await transaction.membership.upsert({
					where: { userId_programId: { userId: user.id, programId } },
					create: { userId: user.id, programId, permissions: allPermissions },
					update: { permissions: allPermissions }
				});
				addedUserIds.push(user.id);
				await transaction.invite.updateMany({
					where: { email: { equals: email, mode: 'insensitive' }, programId, acceptedAt: null },
					data: { acceptedAt: new Date() }
				});
			} else if (!haveInvite.has(email)) {
				await transaction.invite.create({
					data: { email, programId, permissions: allPermissions }
				});
			}
		}
		newPocId = await setPoc(transaction, programId, poc);
		await transaction.activityEvent.create({
			data: {
				programId,
				kind: 'SETTINGS',
				actorId: actor.id,
				text: `Updated ${name} settings`,
				meta: {
					event: 'program_updated',
					name,
					accepts,
					allowVms,
					secondPass,
					organizers: [...desired],
					poc: poc || null
				}
			}
		});
	});
	for (const userId of removedUserIds) queueReviewersChannelSync(programId, userId, 'remove');
	for (const userId of addedUserIds) queueReviewersChannelSync(programId, userId, 'add');
	// the prior poc is included: losing the badge may drop them from an org channel
	queueOrgChannelSync(...removedUserIds, ...addedUserIds, newPocId, priorPoc?.userId);
	return { ok: true };
}
