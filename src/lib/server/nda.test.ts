import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	fetchNdaStatus,
	forgetNdaStatus,
	isNdaExempt,
	ndaBlocks,
	ndaEnabled,
	parseNdaResponse,
	wantsPage,
	type NdaStatus
} from './nda';

let savedBase: string | undefined;
beforeEach(() => {
	savedBase = process.env.NDA_API_BASE;
	process.env.NDA_API_BASE = 'https://nda.example.com/';
});
afterEach(() => {
	if (savedBase === undefined) delete process.env.NDA_API_BASE;
	else process.env.NDA_API_BASE = savedBase;
});

describe('isNdaExempt', () => {
	test('only the staff domain is exempt', () => {
		expect(isNdaExempt('user1@hackclub.com')).toBe(true);
		expect(isNdaExempt('User1@HackClub.com')).toBe(true);
		expect(isNdaExempt('user1@nothackclub.com')).toBe(false);
		expect(isNdaExempt('user1@hackclub.com.example.com')).toBe(false);
		expect(isNdaExempt('hackclub.com@example.com')).toBe(false);
		expect(isNdaExempt('user1@sub.hackclub.com')).toBe(false);
	});
});

describe('ndaBlocks', () => {
	test('blocks everything but a signature, an exemption or a disabled gate', () => {
		const blocked: Record<NdaStatus, boolean> = {
			signed: false,
			exempt: false,
			disabled: false,
			unsigned: true,
			noSlack: true,
			unknown: true
		};
		for (const [status, expected] of Object.entries(blocked)) {
			expect(ndaBlocks(status as NdaStatus)).toBe(expected);
		}
	});
});

describe('parseNdaResponse', () => {
	test('signed carries the signing time', () => {
		const lookup = parseNdaResponse(200, { status: 'signed', signed_at: '2025-04-02T15:04:05Z' });
		expect(lookup.status).toBe('signed');
		if (lookup.status === 'signed') {
			expect(lookup.signedAt.toISOString()).toBe('2025-04-02T15:04:05.000Z');
		}
	});
	test('signed without a usable time falls back to now', () => {
		const before = Date.now();
		const lookup = parseNdaResponse(200, { status: 'signed', signed_at: 'garbage' });
		expect(lookup.status).toBe('signed');
		if (lookup.status === 'signed')
			expect(lookup.signedAt.getTime()).toBeGreaterThanOrEqual(before);
	});
	test('not_signed and a rejected id are unsigned', () => {
		expect(parseNdaResponse(200, { status: 'not_signed' }).status).toBe('unsigned');
		expect(parseNdaResponse(400, { error: 'invalid_slack_id' }).status).toBe('unsigned');
	});
	test('anything else is unknown', () => {
		expect(parseNdaResponse(429, 'Retry later').status).toBe('unknown');
		expect(parseNdaResponse(500, null).status).toBe('unknown');
		expect(parseNdaResponse(200, { status: 'maybe' }).status).toBe('unknown');
		expect(parseNdaResponse(200, 'not json').status).toBe('unknown');
	});
});

describe('wantsPage', () => {
	test('page loads, data requests and enhanced actions redirect', () => {
		expect(wantsPage(new Headers({ accept: 'text/html,application/xhtml+xml' }), false)).toBe(true);
		expect(wantsPage(new Headers({ accept: 'application/json' }), true)).toBe(true);
		expect(wantsPage(new Headers({ 'x-sveltekit-action': 'true' }), false)).toBe(true);
	});
	test('bare json fetches do not', () => {
		expect(wantsPage(new Headers({ accept: 'application/json' }), false)).toBe(false);
		expect(wantsPage(new Headers(), false)).toBe(false);
	});
});

describe('fetchNdaStatus', () => {
	const slackIdOf = (suffix: string) => `U${Date.now()}${suffix}`;
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
	const jsonResponse = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});

	test('the gate is off when the base url is blank', async () => {
		process.env.NDA_API_BASE = '';
		expect(ndaEnabled()).toBe(false);
		const { calls, fetchFn } = fetchStub([]);
		expect((await fetchNdaStatus(slackIdOf('A'), fetchFn)).status).toBe('unknown');
		expect(calls).toHaveLength(0);
	});

	test('builds the url from the trimmed base and the slack id', async () => {
		const slackId = slackIdOf('B');
		const { calls, fetchFn } = fetchStub([() => jsonResponse(200, { status: 'signed' })]);
		expect((await fetchNdaStatus(slackId, fetchFn)).status).toBe('signed');
		expect(calls).toEqual([`https://nda.example.com/api/v1/nda_status/${slackId}`]);
	});

	test('a signature is never cached here, a miss is', async () => {
		const signedId = slackIdOf('C');
		const signed = fetchStub([
			() => jsonResponse(200, { status: 'signed' }),
			() => jsonResponse(200, { status: 'signed' })
		]);
		await fetchNdaStatus(signedId, signed.fetchFn);
		await fetchNdaStatus(signedId, signed.fetchFn);
		expect(signed.calls).toHaveLength(2);

		const unsignedId = slackIdOf('D');
		const unsigned = fetchStub([() => jsonResponse(200, { status: 'not_signed' })]);
		expect((await fetchNdaStatus(unsignedId, unsigned.fetchFn)).status).toBe('unsigned');
		expect((await fetchNdaStatus(unsignedId, unsigned.fetchFn)).status).toBe('unsigned');
		expect(unsigned.calls).toHaveLength(1);
	});

	test('forgetting a miss forces a fresh lookup', async () => {
		const slackId = slackIdOf('E');
		const { calls, fetchFn } = fetchStub([
			() => jsonResponse(200, { status: 'not_signed' }),
			() => jsonResponse(200, { status: 'signed' })
		]);
		expect((await fetchNdaStatus(slackId, fetchFn)).status).toBe('unsigned');
		forgetNdaStatus(slackId);
		expect((await fetchNdaStatus(slackId, fetchFn)).status).toBe('signed');
		expect(calls).toHaveLength(2);
	});

	test('a network failure is unknown', async () => {
		const failing = (async () => {
			throw new Error('connect ECONNREFUSED');
		}) as unknown as typeof fetch;
		expect((await fetchNdaStatus(slackIdOf('F'), failing)).status).toBe('unknown');
	});

	test('a rate limit backs off every user until retry-after passes', async () => {
		const limited = fetchStub([
			() => new Response('Retry later', { status: 429, headers: { 'retry-after': '1' } })
		]);
		expect((await fetchNdaStatus(slackIdOf('G'), limited.fetchFn)).status).toBe('unknown');
		const other = fetchStub([() => jsonResponse(200, { status: 'signed' })]);
		expect((await fetchNdaStatus(slackIdOf('H'), other.fetchFn)).status).toBe('unknown');
		expect(other.calls).toHaveLength(0);
		// 1 second: the retry-after above, plus a little slack
		await Bun.sleep(1100);
		expect((await fetchNdaStatus(slackIdOf('H'), other.fetchFn)).status).toBe('signed');
	});
});
