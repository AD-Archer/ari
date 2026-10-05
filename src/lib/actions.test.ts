import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

const goto = mock(async () => {});
const invalidateAll = mock(async () => {});
const toastError = mock(() => 0);
const toastSuccess = mock(() => 0);

// the real deserialize also revives devalue data; plain json is enough to exercise the branches
mock.module('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));
mock.module('$app/navigation', () => ({ goto, invalidateAll }));
mock.module('$lib/toast.svelte', () => ({ toast: { error: toastError, success: toastSuccess } }));

const { submitAction } = await import('./actions');

const realFetch = globalThis.fetch;
let fetchMock = mock(async (): Promise<Response> => new Response(''));

function respondWith(body: unknown, status = 200) {
	fetchMock = mock(async () => new Response(JSON.stringify(body), { status }));
	globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function lastRequest() {
	const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
	return { url, init, formData: init.body as FormData };
}

beforeEach(() => {
	for (const spy of [goto, invalidateAll, toastError, toastSuccess]) spy.mockClear();
});
afterEach(() => {
	globalThis.fetch = realFetch;
});

test('success returns the data and invalidates', async () => {
	respondWith({ type: 'success', status: 200, data: { plaintext: 'secret' } });
	const result = await submitAction('rollSecret');
	expect(result).toEqual({ ok: true, data: { plaintext: 'secret' } });
	expect(invalidateAll).toHaveBeenCalledTimes(1);
	expect(lastRequest().url).toBe('?/rollSecret');
	expect(lastRequest().init.method).toBe('POST');
});

test('invalidate false skips the reload', async () => {
	respondWith({ type: 'success', status: 200 });
	const result = await submitAction('heartbeat', {}, { invalidate: false });
	expect(result).toEqual({ ok: true, data: undefined });
	expect(invalidateAll).not.toHaveBeenCalled();
});

test('an object body becomes form data, skipping empty values and repeating arrays', async () => {
	respondWith({ type: 'success', status: 200 });
	await submitAction('save', { name: 'Ari', count: 3, skipped: null, tags: ['one', 'two'] });
	const { formData } = lastRequest();
	expect(formData.get('name')).toBe('Ari');
	expect(formData.get('count')).toBe('3');
	expect(formData.has('skipped')).toBe(false);
	expect(formData.getAll('tags')).toEqual(['one', 'two']);
});

test('a form data body is sent as given', async () => {
	respondWith({ type: 'success', status: 200 });
	const body = new FormData();
	body.set('note', 'looks good');
	await submitAction('approve', body);
	expect(lastRequest().formData).toBe(body);
});

test('actionUrl and keepalive reach fetch', async () => {
	respondWith({ type: 'success', status: 200 });
	await submitAction(
		'release',
		{},
		{ actionUrl: '/programs/summer/review/abc', keepalive: true, invalidate: false }
	);
	const { url, init } = lastRequest();
	expect(url).toBe('/programs/summer/review/abc?/release');
	expect(init.keepalive).toBe(true);
});

test('failure returns the status, the action error and its data', async () => {
	respondWith({ type: 'failure', status: 409, data: { error: 'Already claimed', locked: true } });
	const result = await submitAction('claim');
	expect(result).toEqual({
		ok: false,
		status: 409,
		message: 'Already claimed',
		data: { error: 'Already claimed', locked: true }
	});
	expect(invalidateAll).not.toHaveBeenCalled();
	expect(toastError).not.toHaveBeenCalled();
});

test('failure without an error string falls back, and toasts when asked', async () => {
	respondWith({ type: 'failure', status: 400, data: {} });
	const result = await submitAction(
		'save',
		{},
		{ errorToast: true, fallbackMessage: 'Could not save program' }
	);
	expect(result).toMatchObject({ ok: false, status: 400, message: 'Could not save program' });
	expect(toastError).toHaveBeenCalledWith('Could not save program');
});

test('redirect navigates and reports where', async () => {
	respondWith({ type: 'redirect', status: 303, location: '/programs/summer/queue' });
	const result = await submitAction('finishSession');
	expect(result).toEqual({ ok: true, data: undefined, redirectedTo: '/programs/summer/queue' });
	expect(goto).toHaveBeenCalledWith('/programs/summer/queue', { invalidateAll: true });
	expect(invalidateAll).not.toHaveBeenCalled();
});

test('error result returns the server message', async () => {
	respondWith({ type: 'error', status: 500, error: { message: 'Database unavailable' } }, 500);
	const result = await submitAction('save');
	expect(result).toEqual({
		ok: false,
		status: 500,
		message: 'Database unavailable',
		data: undefined
	});
});

test('a response that is not an action result fails with the http status', async () => {
	fetchMock = mock(async () => new Response('<h1>Method Not Allowed</h1>', { status: 405 }));
	globalThis.fetch = fetchMock as unknown as typeof fetch;
	const result = await submitAction('release');
	expect(result).toMatchObject({ ok: false, status: 405, message: 'Something went wrong' });
});

test('network failure returns ok false instead of throwing', async () => {
	globalThis.fetch = mock(async () => {
		throw new TypeError('Failed to fetch');
	}) as unknown as typeof fetch;
	const result = await submitAction('save', {}, { errorToast: true });
	expect(result).toMatchObject({ ok: false, status: 0 });
	expect(toastError).toHaveBeenCalledTimes(1);
	expect(invalidateAll).not.toHaveBeenCalled();
});
