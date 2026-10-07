import { env } from '$env/dynamic/private';

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

export type NdaStatus = 'signed' | 'unsigned' | 'noSlack' | 'exempt' | 'disabled' | 'unknown';
export type NdaLookup = { status: 'signed'; signedAt: Date } | { status: 'unsigned' | 'unknown' };

const ndaBase = () => (env.NDA_API_BASE ?? '').trim().replace(/\/$/, '');

export const ndaEnabled = () => ndaBase() !== '';
export const ndaSignUrl = () => ndaBase();

export const isNdaExempt = (email: string) => email.toLowerCase().endsWith('@hackclub.com');

export const ndaBlocks = (status: NdaStatus) =>
	status === 'unsigned' || status === 'noSlack' || status === 'unknown';

// a thrown redirect becomes the right shape for page loads, data requests and enhanced actions, but a
// bare json fetch from the browser would follow a 303 into html, so those get a 403 instead
export function wantsPage(headers: Headers, isDataRequest: boolean): boolean {
	if (isDataRequest || headers.has('x-sveltekit-action')) return true;
	return (headers.get('accept') ?? '').includes('text/html');
}

export function parseNdaResponse(httpStatus: number, body: unknown): NdaLookup {
	const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
	if (httpStatus === 200 && record.status === 'signed') {
		const signedAt = typeof record.signed_at === 'string' ? new Date(record.signed_at) : new Date();
		return { status: 'signed', signedAt: Number.isNaN(signedAt.getTime()) ? new Date() : signedAt };
	}
	if (httpStatus === 200 && record.status === 'not_signed') return { status: 'unsigned' };
	if (httpStatus === 400) return { status: 'unsigned' };
	return { status: 'unknown' };
}

// only misses are cached: a signature is persisted on the user row instead
const missCache = new Map<string, { lookup: NdaLookup; expires: number }>();
// the limit is per client ip and every user shares the server's, so one backoff covers everyone
let retryAfterUntil = 0;

export function forgetNdaStatus(slackId: string): void {
	missCache.delete(slackId);
}

export async function fetchNdaStatus(
	slackId: string,
	fetchFn: typeof fetch = realFetch
): Promise<NdaLookup> {
	const base = ndaBase();
	if (!base) return { status: 'unknown' };

	const cached = missCache.get(slackId);
	if (cached && cached.expires > Date.now()) return cached.lookup;
	if (retryAfterUntil > Date.now()) return { status: 'unknown' };

	let lookup: NdaLookup = { status: 'unknown' };
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 8000); // 8 seconds: 8 * 1000
	try {
		const response = await fetchFn(`${base}/api/v1/nda_status/${encodeURIComponent(slackId)}`, {
			headers: { accept: 'application/json' },
			signal: controller.signal
		});
		if (response.status === 429) {
			// retry-after is whole seconds, so * 1000 makes ms; a missing or unusable header backs off 1 second
			const seconds = Number(response.headers.get('retry-after') ?? '1');
			retryAfterUntil = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000;
			console.warn(`[nda] nda_status ${slackId} -> http 429, backing off ${seconds}s`);
		} else {
			const body = await response.json().catch(() => null);
			lookup = parseNdaResponse(response.status, body);
			if (lookup.status === 'unknown') {
				console.warn(`[nda] nda_status ${slackId} -> http ${response.status}`);
			}
		}
	} catch (caught) {
		const reason = controller.signal.aborted
			? 'timeout'
			: caught instanceof Error
				? caught.message
				: 'network error';
		console.warn(`[nda] nda_status ${slackId} -> ${reason}`);
	} finally {
		clearTimeout(timer);
	}

	if (lookup.status === 'unsigned') {
		missCache.set(slackId, { lookup, expires: Date.now() + 60000 }); // 1 minute: 60 * 1000
	} else if (lookup.status === 'unknown') {
		missCache.set(slackId, { lookup, expires: Date.now() + 15000 }); // 15 seconds: 15 * 1000
	}
	return lookup;
}
