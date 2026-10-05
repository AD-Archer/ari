import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { imageObjectKey, imageUploadsConfigured, uploadImage } from './imageUpload';

const names = [
	'R2_ENDPOINT',
	'R2_BUCKET',
	'R2_ACCESS_KEY_ID',
	'R2_SECRET_ACCESS_KEY',
	'R2_PUBLIC_URL'
];
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let sent: { url: string; method: string; headers: Record<string, string>; bytes: number }[] = [];
let answer = () => new Response(null, { status: 200 });

const image = (type = 'image/png', size = 4) =>
	new File([new Uint8Array(size)], '../../name from the browser.exe', { type });

beforeEach(() => {
	for (const name of names) saved[name] = process.env[name];
	process.env.R2_ENDPOINT = 'https://account1.storage.example.com/';
	process.env.R2_BUCKET = 'bucket1';
	process.env.R2_ACCESS_KEY_ID = 'key1';
	process.env.R2_SECRET_ACCESS_KEY = 'secret1';
	process.env.R2_PUBLIC_URL = 'https://assets.example.com/';
	sent = [];
	answer = () => new Response(null, { status: 200 });
	globalThis.fetch = (async (input: URL, init: RequestInit) => {
		sent.push({
			url: String(input),
			method: init.method ?? '',
			headers: init.headers as Record<string, string>,
			bytes: (init.body as Uint8Array).length
		});
		return answer();
	}) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	for (const name of names) {
		if (saved[name] === undefined) delete process.env[name];
		else process.env[name] = saved[name];
	}
});

describe('uploadImage', () => {
	test('puts the file in the bucket and answers with its public url', async () => {
		const result = await uploadImage(image());
		expect(sent.length).toBe(1);
		const [request] = sent;
		expect(request.method).toBe('PUT');
		expect(request.url).toMatch(
			/^https:\/\/account1\.storage\.example\.com\/bucket1\/uploads\/\d{4}\/[0-9a-f-]{36}\.png$/
		);
		expect(request.bytes).toBe(4);
		expect(request.headers['content-type']).toBe('image/png');
		expect(request.headers.authorization).toContain('Credential=key1/');
		expect(request.headers.authorization).toContain('/auto/s3/aws4_request');
		expect(request.headers.authorization).not.toContain('secret1');
		expect(request.headers.host).toBeUndefined();
		const key = request.url.split('/bucket1/')[1];
		expect(result).toEqual({ ok: true, url: `https://assets.example.com/${key}` });
	});

	test('the stored name owes nothing to the name the browser sent', () => {
		const key = imageObjectKey('image/jpeg', new Date('2026-10-05T00:00:00Z'), 'id1');
		expect(key).toBe('uploads/2026/id1.jpg');
	});

	test('refuses what is not a storable image, without calling storage', async () => {
		for (const file of [
			null,
			'text',
			image('text/html'),
			image('image/x-icon'),
			image('image/png', 0)
		]) {
			expect((await uploadImage(file)).ok).toBe(false);
		}
		// 8388609: one byte over the 8 MB limit, 8 * 1024 * 1024 + 1
		expect(await uploadImage(image('image/png', 8388609))).toMatchObject({ status: 422 });
		expect(sent.length).toBe(0);
	});

	test('a storage failure is a 502, not a url', async () => {
		answer = () => new Response('denied', { status: 403 });
		expect(await uploadImage(image())).toMatchObject({ ok: false, status: 502 });
		globalThis.fetch = (async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch;
		expect(await uploadImage(image())).toMatchObject({ ok: false, status: 502 });
	});

	test('is off until every setting is present', async () => {
		expect(imageUploadsConfigured()).toBe(true);
		for (const name of names) {
			const value = process.env[name];
			process.env[name] = ' ';
			expect(imageUploadsConfigured()).toBe(false);
			expect(await uploadImage(image())).toMatchObject({ ok: false, status: 503 });
			process.env[name] = value;
		}
		expect(sent.length).toBe(0);
	});
});
