import { env } from '$env/dynamic/private';

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

export interface SlackProfile {
	displayName: string | null;
	// the account handle (the @-mention slug), not the freely set display name
	username: string | null;
	image: string | null;
}

const profileCache = new Map<string, { profile: SlackProfile | null; expires: number }>();
const cachetCache = new Map<string, { url: string | null; expires: number }>();

const cacheExpiry = () => Date.now() + 3600000; // 1 hour: 60 * 60 * 1000

export async function slackProfile(slackId: string): Promise<SlackProfile | null> {
	const token = env.SLACK_BOT_TOKEN;
	if (!token || !slackId) return null;

	const cached = profileCache.get(slackId);
	if (cached && cached.expires > Date.now()) return cached.profile;

	const response = await realFetch(
		`https://slack.com/api/users.info?user=${encodeURIComponent(slackId)}`,
		{ headers: { Authorization: `Bearer ${token}` } }
	);
	if (!response.ok) {
		console.warn(`[slack] users.info ${slackId} -> http ${response.status}`);
		return null;
	}

	const data = (await response.json()) as {
		ok: boolean;
		error?: string;
		user?: {
			name?: string;
			profile?: {
				display_name?: string;
				real_name?: string;
				image_512?: string;
				image_192?: string;
				image_72?: string;
			};
		};
	};
	if (!data.ok || !data.user?.profile) {
		console.warn(`[slack] users.info ${slackId} -> ${data.error ?? 'no profile on user'}`);
		// misses are cached too: unknown or deactivated ids should not retry every render
		profileCache.set(slackId, { profile: null, expires: cacheExpiry() });
		return null;
	}

	const slackUser = data.user.profile;
	const profile: SlackProfile = {
		displayName: slackUser.display_name || slackUser.real_name || null,
		username: data.user.name || null,
		image: slackUser.image_512 || slackUser.image_192 || slackUser.image_72 || null
	};
	profileCache.set(slackId, { profile, expires: cacheExpiry() });
	return profile;
}

export async function cachetImage(slackId: string): Promise<string | null> {
	const cachetBase = env.CACHET_URL?.trim().replace(/\/$/, '');
	if (!cachetBase || !slackId) return null;
	const cached = cachetCache.get(slackId);
	if (cached && cached.expires > Date.now()) return cached.url;

	let url: string | null = null;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000); // 8 seconds in ms
	try {
		const response = await realFetch(`${cachetBase}/users/${encodeURIComponent(slackId)}`, {
			signal: controller.signal
		});
		if (response.ok) {
			const data = (await response.json()) as { imageUrl?: unknown };
			if (typeof data.imageUrl === 'string' && /^https?:\/\//i.test(data.imageUrl)) {
				url = data.imageUrl;
			}
		} else {
			console.warn(`[cachet] users/${slackId} -> http ${response.status}`);
		}
	} catch (caught) {
		const reason = controller.signal.aborted
			? 'timeout'
			: caught instanceof Error
				? caught.message
				: 'network error';
		console.warn(`[cachet] users/${slackId} -> ${reason}`);
	} finally {
		clearTimeout(timer);
	}
	cachetCache.set(slackId, { url, expires: cacheExpiry() });
	return url;
}

// cachet first: it resolves the whole enterprise grid, which a workspace bot token cannot
export async function avatarImageUrl(slackId: string): Promise<string | null> {
	return (await cachetImage(slackId)) ?? (await slackProfile(slackId))?.image ?? null;
}
