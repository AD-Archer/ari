import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { toast } from '$lib/toast.svelte';

export type ActionData = Record<string, unknown>;

export type ActionResult<Data extends ActionData = ActionData> =
	| { ok: true; data: Data | undefined; redirectedTo?: string }
	| { ok: false; status: number; message: string; data?: ActionData };

type ActionValue = string | number | boolean | Blob | null | undefined;

export type ActionBody = FormData | Record<string, ActionValue | ActionValue[]>;

export interface SubmitActionOptions {
	actionUrl?: string;
	keepalive?: boolean;
	invalidate?: boolean;
	errorToast?: boolean;
	fallbackMessage?: string;
}

function toFormData(body: ActionBody): FormData {
	if (body instanceof FormData) return body;
	const formData = new FormData();
	for (const [key, entry] of Object.entries(body)) {
		for (const value of Array.isArray(entry) ? entry : [entry]) {
			if (value === null || value === undefined) continue;
			formData.append(key, value instanceof Blob ? value : String(value));
		}
	}
	return formData;
}

function failureMessage(data: ActionData | undefined, fallbackMessage: string): string {
	for (const candidate of [data?.error, data?.message]) {
		if (typeof candidate === 'string' && candidate) return candidate;
	}
	return fallbackMessage;
}

export async function submitAction<Data extends ActionData = ActionData>(
	actionName: string,
	body: ActionBody = {},
	options: SubmitActionOptions = {}
): Promise<ActionResult<Data>> {
	const fallbackMessage = options.fallbackMessage ?? 'Something went wrong';

	function fail(status: number, message: string, data?: ActionData): ActionResult<Data> {
		if (options.errorToast) toast.error(message);
		return { ok: false, status, message, data };
	}

	// a relative `?/name` resolves against whatever page is current when the request fires, which
	// is already the next page during a navigation, so those callers pin the route with actionUrl
	const url = `${options.actionUrl ?? ''}?/${actionName}`;

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			body: toFormData(body),
			keepalive: options.keepalive,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	} catch {
		return fail(0, 'Network error. Check your connection and try again.');
	}

	let result: ReturnType<typeof deserialize>;
	try {
		result = deserialize(await response.text());
	} catch {
		return fail(response.status, fallbackMessage);
	}

	if (result.type === 'success') {
		if (options.invalidate !== false) await invalidateAll();
		return { ok: true, data: result.data as Data | undefined };
	}
	if (result.type === 'redirect') {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the server action chose this location
		await goto(result.location, { invalidateAll: options.invalidate !== false });
		return { ok: true, data: undefined, redirectedTo: result.location };
	}
	if (result.type === 'failure') {
		return fail(result.status, failureMessage(result.data, fallbackMessage), result.data);
	}
	return fail(
		result.status ?? response.status,
		typeof result.error?.message === 'string' ? result.error.message : fallbackMessage
	);
}

export async function copyText(text: string, successMessage = 'Copied'): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		toast.error('Copy failed');
		return false;
	}
	toast.success(successMessage, { icon: 'clip' });
	return true;
}
