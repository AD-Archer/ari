import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';

const apiBase = () => (env.VM_API_BASE?.trim() ?? '').replace(/\/$/, '');
const apiToken = () => env.VM_API_TOKEN?.trim() ?? '';

// captured at load: sveltekit dev patches globalThis.fetch during ssr
const realFetch = globalThis.fetch;

export type VmType = 'linux' | 'windows' | 'android';
export const vmTypes: VmType[] = ['linux', 'windows', 'android'];
export const isVmType = (value: unknown): value is VmType => vmTypes.includes(value as VmType);

export const vmConfigured = (): boolean => apiBase().length > 0 && apiToken().length > 0;

export interface CreatedVm {
	vmid: number;
	name: string;
	guacUrl: string;
	// host:port, null for android (browser-only)
	rdp: string | null;
	rdpUsername: string | null;
	rdpPassword: string | null;
}

export type VmResult = { ok: true; vm: CreatedVm } | { ok: false; error: string };

export function rdpUri(host: string, username: string): string {
	return `rdp://full%20address=s:${host}&username=s:${username}`;
}

// crlf line endings: .rdp is a windows format
export function rdpFile(host: string, username: string): string {
	return (
		[
			`full address:s:${host}`,
			`username:s:${username}`,
			'prompt for credentials:i:1',
			'authentication level:i:0',
			'administrative session:i:0',
			'screen mode id:i:2',
			'redirectclipboard:i:1'
		].join('\r\n') + '\r\n'
	);
}

// decoded: older rows stored host%3Aport, which an .rdp file must not contain
export function rdpHostFromUri(uri: string): string | null {
	const raw = uri.match(/address=s:([^&]+)/)?.[1];
	if (!raw) return null;
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

async function call(
	path: string,
	options: { method: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: unknown }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 90000); // 90 s: 90 * 1000
	try {
		const response = await realFetch(`${apiBase()}${path}`, {
			method: options.method,
			headers: {
				Authorization: `Bearer ${apiToken()}`,
				...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
			},
			body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
			signal: controller.signal
		});
		let data: unknown = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		if (!response.ok) console.warn(`[vm] ${options.method} ${path} -> http ${response.status}`);
		return { ok: response.ok, status: response.status, data };
	} catch (error) {
		console.warn(
			`[vm] ${options.method} ${path} -> ${controller.signal.aborted ? 'timeout after 90000ms' : error instanceof Error ? error.message : 'network error'}`
		);
		return { ok: false, status: 0, data: null };
	} finally {
		clearTimeout(timer);
	}
}

const asObject = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const asString = (value: unknown): string | null =>
	typeof value === 'string' && value ? value : null;

export async function createVm(type: VmType, reviewerEmail: string): Promise<VmResult> {
	if (!vmConfigured()) return { ok: false, error: 'VM platform is not configured.' };
	const result = await call('/vms', { method: 'POST', body: { type, reviewer: reviewerEmail } });
	if (!result.ok) {
		const message = asString(asObject(result.data).error);
		return {
			ok: false,
			error:
				message ??
				(result.status === 0
					? 'Could not reach the VM platform.'
					: `VM platform returned ${result.status}.`)
		};
	}
	const data = asObject(result.data);
	const vmid = typeof data.vmid === 'number' ? data.vmid : Number(data.vmid);
	const guacUrl = asString(asObject(data.guac).url);
	if (!Number.isFinite(vmid) || !guacUrl) {
		return { ok: false, error: 'VM platform returned an unexpected response.' };
	}
	const credentials = asObject(data.vmCredentials);
	return {
		ok: true,
		vm: {
			vmid,
			name: asString(data.name) ?? `${type}-${vmid}`,
			guacUrl,
			rdp: asString(data.rdp),
			rdpUsername: asString(credentials.username),
			rdpPassword: asString(credentials.password)
		}
	};
}

export async function deleteVm(vmid: number): Promise<boolean> {
	if (!vmConfigured()) return false;
	const result = await call(`/vms/${vmid}`, { method: 'DELETE' });
	// 404 is already gone, so a stale row still clears
	return result.ok || result.status === 404;
}

// an unconfirmed delete leaves a tombstone for the ari-webhooks sweep to retry
async function killOrTombstone(vmid: number): Promise<void> {
	if (await deleteVm(vmid)) {
		await db.vmTombstone.deleteMany({ where: { vmid } }).catch(() => {});
		return;
	}
	await db.vmTombstone
		.upsert({
			where: { vmid },
			create: { vmid },
			update: { attempts: { increment: 1 }, lastTriedAt: new Date() }
		})
		.catch((error) => console.warn(`[vm] could not tombstone vm ${vmid}`, error));
}

// fire-and-forget: a decision must not hinge on the vm platform being up
export function teardownVms(vmids: number[]): void {
	if (!vmConfigured() || !vmids.length) return;
	void Promise.allSettled(vmids.map((vmid) => killOrTombstone(vmid)));
}
