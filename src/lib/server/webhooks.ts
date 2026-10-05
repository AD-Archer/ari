import { env } from '$env/dynamic/private';

const baseUrl = () => (env.WEBHOOKS_URL?.trim() ?? '').replace(/\/$/, '');
const internalToken = () => env.WEBHOOKS_INTERNAL_TOKEN?.trim() ?? '';

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

export const webhooksBaseUrl = () => baseUrl();

export const webhooksConfigured = (): boolean => baseUrl().length > 0 && internalToken().length > 0;

export function internalFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return realFetch(`${baseUrl()}/internal/${path}`, {
		...init,
		headers: { authorization: `Bearer ${internalToken()}` }
	});
}

export type ReenrichTrigger = { ok: true } | { ok: false; message: string };

export async function triggerReenrich(submissionId: string): Promise<ReenrichTrigger> {
	if (!webhooksConfigured()) {
		return { ok: false, message: 'Evidence resync is not configured on this deployment' };
	}
	try {
		const response = await internalFetch(`reenrich/${encodeURIComponent(submissionId)}`, {
			method: 'POST'
		});
		if (response.ok) return { ok: true };
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		return {
			ok: false,
			message: body?.message || `Could not start the resync (http ${response.status})`
		};
	} catch (error) {
		console.warn(`[webhooks] reenrich trigger for ${submissionId} failed:`, error);
		return { ok: false, message: 'Could not reach the evidence service. Try again in a moment.' };
	}
}

export type ReenrichProgramTrigger = { ok: true; queued: number } | { ok: false; message: string };

export async function triggerReenrichProgram(programId: string): Promise<ReenrichProgramTrigger> {
	if (!webhooksConfigured()) {
		return { ok: false, message: 'Re-ingestion is not configured on this deployment' };
	}
	try {
		const response = await internalFetch(`reenrich-program/${encodeURIComponent(programId)}`, {
			method: 'POST',
			signal: AbortSignal.timeout(30000) // 30 s: 30 * 1000
		});
		const body = (await response.json().catch(() => null)) as {
			ok?: boolean;
			queued?: number;
			message?: string;
		} | null;
		if (response.ok && body?.ok) return { ok: true, queued: body.queued ?? 0 };
		return {
			ok: false,
			message: body?.message || `Could not start the re-ingestion (http ${response.status})`
		};
	} catch (error) {
		console.warn(`[webhooks] reenrich-program trigger for ${programId} failed:`, error);
		return { ok: false, message: 'Could not reach the evidence service. Try again in a moment.' };
	}
}

export type FileSource =
	| { ok: true; content: string; truncated: boolean }
	| { ok: false; message: string };

export async function fetchFileSource(submissionId: string, path: string): Promise<FileSource> {
	if (!webhooksConfigured()) {
		return { ok: false, message: 'File preview is not configured on this deployment' };
	}
	try {
		const response = await internalFetch(
			`filesource/${encodeURIComponent(submissionId)}?path=${encodeURIComponent(path)}`,
			{ signal: AbortSignal.timeout(95000) } // 95 s, past the service's own 90 s clone bound: 95 * 1000
		);
		const body = (await response.json()) as {
			ok?: boolean;
			content?: string;
			truncated?: boolean;
			message?: string;
		};
		if (body.ok) {
			return { ok: true, content: body.content ?? '', truncated: Boolean(body.truncated) };
		}
		return { ok: false, message: body.message || 'Could not load the file' };
	} catch (error) {
		console.warn(`[webhooks] filesource for ${submissionId} failed:`, error);
		return { ok: false, message: 'Could not load the file right now. Try again in a moment.' };
	}
}

export type RepoReadme = { ok: true; readme: string } | { ok: false; message: string };

export async function fetchReadme(submissionId: string): Promise<RepoReadme> {
	if (!webhooksConfigured()) {
		return { ok: false, message: 'README preview is not configured on this deployment' };
	}
	try {
		const response = await internalFetch(`readme/${encodeURIComponent(submissionId)}`, {
			signal: AbortSignal.timeout(95000) // 95 s, past the service's own 90 s clone bound: 95 * 1000
		});
		const body = (await response.json()) as { ok?: boolean; readme?: string; message?: string };
		if (body.ok) return { ok: true, readme: body.readme ?? '' };
		return { ok: false, message: body.message || 'Could not load the README' };
	} catch (error) {
		console.warn(`[webhooks] readme for ${submissionId} failed:`, error);
		return { ok: false, message: 'Could not load the README right now. Try again in a moment.' };
	}
}
