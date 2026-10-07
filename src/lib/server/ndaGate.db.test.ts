import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { ndaStatus } from './ndaGate';

const prefix = `ndaGateTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
let savedBase: string | undefined;

const jsonResponse = (body: unknown) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
const fetchStub = (responses: Array<() => Response>) => {
	const calls: string[] = [];
	const fetchFn = (async (input: string | URL | Request) => {
		calls.push(String(input));
		const next = responses.shift();
		if (!next) throw new Error('no more responses');
		return next();
	}) as unknown as typeof fetch;
	return { calls, fetchFn };
};

async function makeUser(
	suffix: string,
	overrides: {
		email?: string;
		slackId?: string | null;
		ndaSignedAt?: Date;
		ndaCheckedAt?: Date;
	} = {}
) {
	const id = `${prefix}${suffix}`;
	return db.user.create({
		data: {
			id,
			email: overrides.email ?? `${id.toLowerCase()}@example.com`,
			name: `User ${suffix}`,
			avatarColor: '#338eda',
			slackId: overrides.slackId === undefined ? `U${id}` : overrides.slackId,
			ndaSignedAt: overrides.ndaSignedAt,
			ndaCheckedAt: overrides.ndaCheckedAt
		},
		select: { id: true, email: true, slackId: true, ndaSignedAt: true, ndaCheckedAt: true }
	});
}
const rowOf = (id: string) =>
	db.user.findUniqueOrThrow({ where: { id }, select: { ndaSignedAt: true, ndaCheckedAt: true } });

beforeAll(() => {
	savedBase = process.env.NDA_API_BASE;
});
beforeEach(() => {
	process.env.NDA_API_BASE = 'https://nda.example.com';
});
afterEach(async () => {
	await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});
afterAll(() => {
	if (savedBase === undefined) delete process.env.NDA_API_BASE;
	else process.env.NDA_API_BASE = savedBase;
});

test('a blank base disables the gate without touching the api', async () => {
	process.env.NDA_API_BASE = '';
	const user = await makeUser('Disabled');
	const { calls, fetchFn } = fetchStub([]);
	expect(await ndaStatus(user, fetchFn)).toBe('disabled');
	expect(calls).toHaveLength(0);
});

test('staff addresses are exempt without touching the api', async () => {
	const user = await makeUser('Exempt', { email: `${prefix.toLowerCase()}@hackclub.com` });
	const { calls, fetchFn } = fetchStub([]);
	expect(await ndaStatus(user, fetchFn)).toBe('exempt');
	expect(calls).toHaveLength(0);
});

test('a user without a slack id is blocked and never looked up', async () => {
	const user = await makeUser('NoSlack', { slackId: null });
	const { calls, fetchFn } = fetchStub([]);
	expect(await ndaStatus(user, fetchFn)).toBe('noSlack');
	expect(calls).toHaveLength(0);
});

test('a fresh signature is written to the row', async () => {
	const user = await makeUser('Fresh');
	const { calls, fetchFn } = fetchStub([
		() => jsonResponse({ status: 'signed', signed_at: '2025-04-02T15:04:05Z' })
	]);
	expect(await ndaStatus(user, fetchFn)).toBe('signed');
	expect(calls).toHaveLength(1);
	const row = await rowOf(user.id);
	expect(row.ndaSignedAt?.toISOString()).toBe('2025-04-02T15:04:05.000Z');
	expect(row.ndaCheckedAt).not.toBeNull();
});

test('an unsigned answer is not persisted', async () => {
	const user = await makeUser('Unsigned');
	const { fetchFn } = fetchStub([() => jsonResponse({ status: 'not_signed' })]);
	expect(await ndaStatus(user, fetchFn)).toBe('unsigned');
	expect((await rowOf(user.id)).ndaSignedAt).toBeNull();
});

test('a recorded signature skips the api while the check is fresh', async () => {
	const user = await makeUser('Recorded', { ndaSignedAt: new Date(), ndaCheckedAt: new Date() });
	const { calls, fetchFn } = fetchStub([]);
	expect(await ndaStatus(user, fetchFn)).toBe('signed');
	expect(calls).toHaveLength(0);
});

test('a stale check re-verifies in the background and clears a revoked signature', async () => {
	// 2 days: 2 * 24 * 60 * 60 * 1000
	const stale = new Date(Date.now() - 172800000);
	const user = await makeUser('Stale', { ndaSignedAt: stale, ndaCheckedAt: stale });
	const { calls, fetchFn } = fetchStub([() => jsonResponse({ status: 'not_signed' })]);
	expect(await ndaStatus(user, fetchFn)).toBe('signed');
	expect(calls).toHaveLength(1);
	// the refresh is fire-and-forget, so wait up to 1 second for the update: 50 * 20 ms
	for (let attempt = 0; attempt < 50 && (await rowOf(user.id)).ndaSignedAt; attempt++) {
		await Bun.sleep(20);
	}
	const row = await rowOf(user.id);
	expect(row.ndaSignedAt).toBeNull();
	expect(row.ndaCheckedAt!.getTime()).toBeGreaterThan(stale.getTime());
});

test('an outage during the background refresh keeps the signature', async () => {
	// 2 days: 2 * 24 * 60 * 60 * 1000
	const stale = new Date(Date.now() - 172800000);
	const user = await makeUser('Outage', { ndaSignedAt: stale, ndaCheckedAt: stale });
	const failing = (async () => {
		throw new Error('connect ECONNREFUSED');
	}) as unknown as typeof fetch;
	expect(await ndaStatus(user, failing)).toBe('signed');
	// up to 1 second: 50 * 20 ms
	for (
		let attempt = 0;
		attempt < 50 && !((await rowOf(user.id)).ndaCheckedAt! > stale);
		attempt++
	) {
		await Bun.sleep(20);
	}
	const row = await rowOf(user.id);
	expect(row.ndaSignedAt?.getTime()).toBe(stale.getTime());
	expect(row.ndaCheckedAt!.getTime()).toBeGreaterThan(stale.getTime());
});
