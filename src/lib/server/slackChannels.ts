import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';

// everything here is best-effort and fire-and-forget: a slack failure logs a warning and
// never fails the mutation that triggered it

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

// blank means that channel is not synced
const embassyChannel = () => env.SLACK_EMBASSY_CHANNEL?.trim() || null;
const pocChannel = () => env.SLACK_POC_CHANNEL?.trim() || null;

type SlackResponse = { ok: boolean; error?: string } & Record<string, unknown>;

async function slackApi(
	method: string,
	parameters: Record<string, string>,
	attempt = 0
): Promise<SlackResponse> {
	const token = env.SLACK_BOT_TOKEN;
	if (!token) return { ok: false, error: 'no_token' };
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 10000); // 10 seconds in ms
	try {
		const response = await realFetch(`https://slack.com/api/${method}`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams(parameters),
			signal: controller.signal
		});
		// honor retry-after, up to 3 retries, so a roster-sized backfill does not skip people
		if (response.status === 429 && attempt < 3) {
			clearTimeout(timer);
			// default 30 seconds, capped at 2 minutes
			const waitSeconds = Math.min(Number(response.headers.get('retry-after')) || 30, 120);
			await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000)); // seconds to ms
			return slackApi(method, parameters, attempt + 1);
		}
		if (!response.ok) return { ok: false, error: `http_${response.status}` };
		return (await response.json()) as SlackResponse;
	} catch (caught) {
		return {
			ok: false,
			error: controller.signal.aborted
				? 'timeout'
				: caught instanceof Error
					? caught.message
					: 'network_error'
		};
	} finally {
		clearTimeout(timer);
	}
}

async function invite(channelId: string | null, slackId: string): Promise<void> {
	if (!channelId) return;
	let result = await slackApi('conversations.invite', { channel: channelId, users: slackId });
	if (!result.ok && result.error === 'not_in_channel') {
		// the bot can self-join public channels only. private ones need a human /invite
		const joined = await slackApi('conversations.join', { channel: channelId });
		if (joined.ok) {
			result = await slackApi('conversations.invite', { channel: channelId, users: slackId });
		}
	}
	if (!result.ok && result.error !== 'already_in_channel') {
		console.warn(`[slack-sync] invite ${slackId} to ${channelId}: ${result.error}`);
	}
}

async function kick(channelId: string | null, slackId: string): Promise<void> {
	if (!channelId) return;
	const result = await slackApi('conversations.kick', { channel: channelId, user: slackId });
	if (!result.ok && result.error !== 'not_in_channel') {
		console.warn(`[slack-sync] kick ${slackId} from ${channelId}: ${result.error}`);
	}
}

async function syncUserOrgChannels(userId: string): Promise<void> {
	const user = await db.user.findUnique({
		where: { id: userId },
		select: {
			slackId: true,
			orgPermissions: true,
			memberships: { select: { isPoc: true, program: { select: { status: true } } } }
		}
	});
	if (!user?.slackId) return;
	// org staff keep their seats without a membership: only ever add them
	const exemptFromKick = user.orgPermissions.length > 0;
	const liveMemberships = user.memberships.filter(
		(membership) => membership.program.status !== 'ARCHIVED'
	);
	const wantEmbassy = liveMemberships.length > 0;
	const wantPoc = liveMemberships.some((membership) => membership.isPoc);
	if (wantEmbassy) await invite(embassyChannel(), user.slackId);
	else if (!exemptFromKick) await kick(embassyChannel(), user.slackId);
	if (wantPoc) await invite(pocChannel(), user.slackId);
	else if (!exemptFromKick) await kick(pocChannel(), user.slackId);
}

// call after the mutation commits: the sync re-reads the db
export function queueOrgChannelSync(...userIds: (string | null | undefined)[]): void {
	const uniqueIds = [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))];
	if (!uniqueIds.length || !env.SLACK_BOT_TOKEN) return;
	void (async () => {
		// sequential on purpose: slack rate-limits bursts of invites and kicks
		for (const userId of uniqueIds) {
			await syncUserOrgChannels(userId).catch((caught) =>
				console.warn(`[slack-sync] org-channel sync for ${userId} failed`, caught)
			);
		}
	})();
}

export function queueProgramOrgChannelSync(programId: string): void {
	if (!env.SLACK_BOT_TOKEN) return;
	void (async () => {
		const members = await db.membership.findMany({
			where: { programId },
			select: { userId: true }
		});
		queueOrgChannelSync(...members.map((member) => member.userId));
	})().catch((caught) =>
		console.warn(`[slack-sync] program org-channel sync for ${programId} failed`, caught)
	);
}

export function queueOrgChannelBackfill(): boolean {
	if (!env.SLACK_BOT_TOKEN) return false;
	void (async () => {
		const users = await db.user.findMany({
			where: { memberships: { some: {} }, slackId: { not: null } },
			select: { id: true }
		});
		for (const user of users) {
			await syncUserOrgChannels(user.id).catch((caught) =>
				console.warn(`[slack-sync] org-channel backfill for ${user.id} failed`, caught)
			);
		}
	})().catch((caught) => console.warn('[slack-sync] org-channel backfill failed', caught));
	return true;
}

export function queueReviewersChannelSync(
	programId: string,
	userId: string,
	operation: 'add' | 'remove'
): void {
	if (!env.SLACK_BOT_TOKEN) return;
	void (async () => {
		const [program, user] = await Promise.all([
			db.program.findUnique({
				where: { id: programId },
				select: { reviewersChannelId: true }
			}),
			db.user.findUnique({ where: { id: userId }, select: { slackId: true } })
		]);
		if (!program?.reviewersChannelId || !user?.slackId) return;
		if (operation === 'add') await invite(program.reviewersChannelId, user.slackId);
		else await kick(program.reviewersChannelId, user.slackId);
	})().catch((caught) =>
		console.warn(`[slack-sync] reviewers-channel ${operation} for ${userId} failed`, caught)
	);
}

export function queueReviewersChannelBackfill(programId: string): void {
	if (!env.SLACK_BOT_TOKEN) return;
	void (async () => {
		const program = await db.program.findUnique({
			where: { id: programId },
			select: { reviewersChannelId: true }
		});
		if (!program?.reviewersChannelId) return;
		const members = await db.membership.findMany({
			where: { programId },
			select: { user: { select: { slackId: true } } }
		});
		for (const member of members) {
			if (member.user.slackId) await invite(program.reviewersChannelId, member.user.slackId);
		}
	})().catch((caught) =>
		console.warn(`[slack-sync] reviewers-channel backfill for ${programId} failed`, caught)
	);
}

// the user row is already gone, so the caller passes a pre-delete snapshot
export function queueDeletedUserKicks(slackId: string | null, programIds: string[]): void {
	if (!slackId || !env.SLACK_BOT_TOKEN) return;
	void (async () => {
		await kick(embassyChannel(), slackId);
		await kick(pocChannel(), slackId);
		if (!programIds.length) return;
		const programs = await db.program.findMany({
			where: { id: { in: programIds }, reviewersChannelId: { not: null } },
			select: { reviewersChannelId: true }
		});
		for (const program of programs) {
			if (program.reviewersChannelId) await kick(program.reviewersChannelId, slackId);
		}
	})().catch((caught) =>
		console.warn(`[slack-sync] deleted-user kicks for ${slackId} failed`, caught)
	);
}

export function parseChannelId(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const fromUrl = /slack\.com\/archives\/([A-Z0-9]+)/i.exec(trimmed)?.[1];
	const candidate = (fromUrl ?? trimmed).toUpperCase();
	// the digit requirement rejects channel names that start with c or g, like "general"
	return /^[CG][A-Z0-9]{8,20}$/.test(candidate) && /\d/.test(candidate) ? candidate : null;
}

export type ChannelStatus =
	| { state: 'in_channel'; name: string | null }
	| { state: 'not_in_channel'; name: string | null }
	| { state: 'not_found' }
	| { state: 'no_token' }
	| { state: 'error'; error: string };

// a private channel the bot was never invited to reads as not_found: slack hides it
export async function channelStatus(channelId: string): Promise<ChannelStatus> {
	if (!env.SLACK_BOT_TOKEN) return { state: 'no_token' };
	const result = await slackApi('conversations.info', { channel: channelId });
	if (result.ok) {
		const channel = result.channel as { name?: string; is_member?: boolean } | undefined;
		return {
			state: channel?.is_member ? 'in_channel' : 'not_in_channel',
			name: channel?.name ?? null
		};
	}
	if (result.error === 'channel_not_found') return { state: 'not_found' };
	return { state: 'error', error: result.error ?? 'unknown' };
}

async function isChannelMember(
	channelId: string,
	slackId: string
): Promise<'member' | 'not_member' | 'unknown'> {
	if (!env.SLACK_BOT_TOKEN) return 'unknown';
	let cursor = '';
	// 25 pages of 1000 members, then give up
	for (let page = 0; page < 25; page++) {
		const result = await slackApi('conversations.members', {
			channel: channelId,
			limit: '1000',
			...(cursor ? { cursor } : {})
		});
		if (!result.ok) return 'unknown';
		if (((result.members as string[] | undefined) ?? []).includes(slackId)) return 'member';
		cursor = (result.response_metadata as { next_cursor?: string } | undefined)?.next_cursor ?? '';
		if (!cursor) return 'not_member';
	}
	return 'unknown';
}

// the linker must be in the channel: the closest verifiable stand-in for "channel manager"
export async function channelLinkerProblem(
	channelId: string,
	linkerSlackId: string | null,
	channelName?: string | null
): Promise<string | null> {
	if (!env.SLACK_BOT_TOKEN) return null;
	const label = channelName ? `#${channelName}` : 'that channel';
	if (!linkerSlackId) {
		return `Your account has no linked Slack id, so Ari can't confirm you're in ${label}. Sign in again through Hack Club Auth, then retry.`;
	}
	switch (await isChannelMember(channelId, linkerSlackId)) {
		case 'member':
			return null;
		case 'not_member':
			return `Only members of ${label} can link it as the reviewers channel. Join the channel, then try again.`;
		default:
			return `Slack could not confirm you're in ${label}. Try again.`;
	}
}
