import { randomBytes } from 'node:crypto';
import { privateProvider } from '$private';
import type { Prisma } from '$db';
import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { isSafeOutboundUrl } from '$lib/server/outboundSigning';
import {
	channelLinkerProblem,
	channelStatus,
	parseChannelId,
	queueReviewersChannelBackfill,
	type ChannelStatus
} from '$lib/server/slackChannels';
import { diffSettings, parseSettingsForm, priorSettingsSelect } from './saveForm';

export type SettingsResult = { ok: true } | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): SettingsResult => ({ ok: false, status, error });

function channelLinkError(status: Exclude<ChannelStatus, { state: 'in_channel' }>): string {
	switch (status.state) {
		case 'not_in_channel':
			return `The Ari Slack App is not in ${status.name ? `#${status.name}` : 'that channel'} yet. Run /invite @Ari Services there, then save again.`;
		case 'not_found':
			return "Ari can't see that channel. Check the id, and for a private channel run /invite @Ari Services there first.";
		case 'no_token':
			return 'Slack is not configured on this instance, so the reviewers channel cannot be linked.';
		default:
			return status.error === 'missing_scope'
				? 'The Ari Slack app is missing OAuth scopes, so the reviewers channel cannot be linked.'
				: `Slack could not be reached to link the channel (${status.error}). Try again.`;
	}
}

export async function saveSettings(
	programId: string,
	actor: App.SessionUser,
	form: FormData
): Promise<SettingsResult> {
	const parsed = parseSettingsForm(form);
	if (!parsed.ok) return refuse(400, parsed.error);
	const { settings } = parsed;
	const { values } = settings;

	const reviewersChannelId = values.reviewersChannel
		? parseChannelId(values.reviewersChannel)
		: null;
	if (values.reviewersChannel && !reviewersChannelId) {
		return refuse(
			400,
			'Reviewers channel must be a Slack channel id (like C0123ABCDEF) or a link to the channel.'
		);
	}
	if (values.outUrl && !isSafeOutboundUrl(values.outUrl)) {
		return refuse(
			400,
			'That webhook host is not allowed. Use a public address, not localhost or a private/internal one.'
		);
	}

	const [prior, priorOutbound] = await Promise.all([
		db.program.findUnique({ where: { id: programId }, select: priorSettingsSelect }),
		db.outboundEndpoint.findUnique({ where: { programId }, select: { url: true, enabled: true } })
	]);

	// org policy: checked here so a direct post cannot switch it off around the locked toggle
	if (
		(prior?.hoursJustification ?? true) &&
		!values.hoursJustification &&
		!hasOrgPermission(actor, 'MANAGE_PROGRAMS')
	) {
		return refuse(
			403,
			'Hours justification can only be turned off by an org admin who can manage programs.'
		);
	}

	// an unchanged saved channel is not re-checked, so a slack outage cannot block unrelated saves
	const channelChanged =
		reviewersChannelId !== null && reviewersChannelId !== (prior?.reviewersChannelId ?? null);
	if (channelChanged) {
		const status = await channelStatus(reviewersChannelId);
		if (status.state !== 'in_channel') return refuse(400, channelLinkError(status));
		const linkerError = await channelLinkerProblem(reviewersChannelId, actor.slackId, status.name);
		if (linkerError) return refuse(400, linkerError);
	}

	const plan = await privateProvider.settingsSave({ programId, actor, form, next: { ...values } });
	if (plan.error) return refuse(400, plan.error);

	// minted the first time priority review is on and never rotated, so a shared link keeps working
	const priorityReviewToken =
		(prior?.priorityReviewToken ?? null) ||
		(values.priorityReview ? randomBytes(24).toString('base64url') : null);
	const priorityTokenMinted = !!priorityReviewToken && !prior?.priorityReviewToken;

	// off keeps a valid posted window, else the stored one, else the 60 minute column default
	const reauthTtlMinutes = settings.reauthTtlMinutes ?? prior?.reviewerReauthTtlMinutes ?? 60;

	const { changed, diff } = diffSettings(prior, priorOutbound, {
		settings,
		reauthTtlMinutes,
		reviewersChannelId,
		priorityTokenMinted
	});
	changed.push(...plan.changed);
	Object.assign(diff, plan.diff);

	const programData: Prisma.ProgramUpdateInput = {
		...plan.programData,
		name: values.displayName,
		accepts: settings.accepts,
		trackingStartsAt: settings.trackingStartsAt,
		collaborative: values.collaborative,
		secondPass: values.secondPass,
		secondPassApproved: values.secondPassApproved,
		secondPassChanges: values.secondPassChanges,
		secondPassRejected: values.secondPassRejected,
		secondPassOrganizerBypass: values.secondPassOrganizerBypass,
		screenIdentity: values.screenIdentity,
		screenHackatime: values.screenHackatime,
		reviewersCannotReviewOwnProjects: values.reviewersCannotReviewOwnProjects,
		allowDeflation: values.allowDeflation,
		hoursJustification: values.hoursJustification,
		reviewerReauth: values.reviewerReauth,
		reviewerReauthTtlMinutes: reauthTtlMinutes,
		priorityReview: values.priorityReview,
		priorityReviewMessage: values.priorityReviewMessage || null,
		priorityReviewToken,
		weeklyReviewGoal: settings.reviewGoal,
		reviewersChannelId,
		iconUrl: values.iconUrl || null,
		cardBgUrl: values.cardBgUrl || null
	};

	await db.$transaction(async (transaction) => {
		await transaction.program.update({ where: { id: programId }, data: programData });
		await plan.writes(transaction);
		await transaction.outboundEndpoint.upsert({
			where: { programId },
			create: { programId, url: values.outUrl || null, enabled: values.outEnabled },
			update: { url: values.outUrl || null, enabled: values.outEnabled }
		});
		if (changed.length) {
			await transaction.activityEvent.create({
				data: {
					programId,
					kind: 'SETTINGS',
					actorId: actor.id,
					text: `Updated settings · ${changed.join(', ')}`,
					meta: { changed, diff }
				}
			});
		}
	});

	// members added before the channel was linked are invited now
	if (channelChanged) queueReviewersChannelBackfill(programId);
	await plan.afterCommit();

	return { ok: true };
}
