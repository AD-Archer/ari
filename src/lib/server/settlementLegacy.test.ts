/* eslint-disable id-length, capitalized-comments -- frozen alongside settlementLegacy.ts */
// Focused settlement tests (pure module, no DB): run with
//
//   bun test src/lib/server/settlementLegacy.test.ts
//
// Covers settlement v2 (tracked-heartbeats crediting), the degraded-capture
// fallback, and v1 replay compatibility - see the header of settlementLegacy.ts.
import { describe, expect, test } from 'bun:test';
import { applyDeflate, clampCollaboratorDeflates, settleHours } from './settlementLegacy';

const mins = (n: number) => n * 60;

/** Evidence shape for a two-person collaborative ship. */
function collabEvidence(over: Partial<Parameters<typeof settleHours>[1]> = {}) {
	return {
		commits: [] as { id: string; codingSeconds: number; makerId?: string | null }[],
		devlogs: [] as { id: string; minutes: number; makerId?: string | null }[],
		clips: [] as { id: string; lengthSeconds: number; makerId?: string | null }[],
		hours: { hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 0 },
		collaborators: [
			{ makerId: 'a', hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 0 },
			{ makerId: 'b', hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 0 }
		],
		...over
	};
}

describe('settlement v2 (tracked heartbeats)', () => {
	test('credits each person their tracked Hackatime minutes - no commit anchoring', () => {
		// The reported bug: person b tracked 6h30m on the project but has no
		// email-matched commits, so v1 settled ~0 for them. v2 credits the
		// tracked minutes directly.
		const evidence = collabEvidence({
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: mins(2), afterLastCommitMinutes: 0, programMinutes: 0 },
				{ makerId: 'b', hackatimeMinutes: mins(6.5), afterLastCommitMinutes: 0, programMinutes: 0 }
			]
		});
		const settled = settleHours({}, evidence, 2);
		expect(settled.approvedMinutes).toBe(mins(8.5));
		expect(settled.breakdown.hackatime).toBe(mins(8.5));
		expect(settled.collaborators.a.hackatime).toBe(mins(2));
		expect(settled.collaborators.b.hackatime).toBe(mins(6.5));
		expect(settled.collaborators.b.total).toBe(mins(6.5));
		// Nothing deflated, nothing recorded.
		expect(settled.adjustments.hackatime).toEqual({});
	});

	test('deflates one person tracked row, deflate-only and clamped', () => {
		const evidence = collabEvidence({
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: mins(2), afterLastCommitMinutes: 0, programMinutes: 0 },
				{ makerId: 'b', hackatimeMinutes: mins(6.5), afterLastCommitMinutes: 0, programMinutes: 0 }
			]
		});
		// b cut to 5h; a's attempted "inflate past captured" is clamped to captured.
		const settled = settleHours({ hackatime: { b: mins(5), a: mins(99) } }, evidence, 2);
		expect(settled.collaborators.a.hackatime).toBe(mins(2));
		expect(settled.collaborators.b.hackatime).toBe(mins(5));
		expect(settled.approvedMinutes).toBe(mins(7));
		expect(settled.adjustments.hackatime).toEqual({ b: mins(5) });
		expect(settled.adjustments.commits).toEqual({});
		expect(settled.adjustments.after).toEqual({});
	});

	test('solo ship: one deflatable tracked row under the literal key', () => {
		const settled = settleHours(
			{ hackatime: { hackatime: mins(3) } },
			{
				commits: [],
				devlogs: [],
				clips: [],
				hours: { hackatimeMinutes: mins(4), afterLastCommitMinutes: 0, programMinutes: 0 }
			},
			2
		);
		expect(settled.approvedMinutes).toBe(mins(3));
		expect(settled.breakdown.hackatime).toBe(mins(3));
		expect(settled.collaborators).toEqual({});
		expect(settled.adjustments.hackatime).toEqual({ hackatime: mins(3) });
	});

	test('journals, lapse and program rows settle as before, per person', () => {
		const evidence = collabEvidence({
			devlogs: [{ id: 'd1', minutes: 90, makerId: 'a' }],
			clips: [{ id: 'c1', lengthSeconds: mins(1) * 60, makerId: 'b' }],
			hours: { hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 120 },
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 90 },
				{ makerId: 'b', hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 30 }
			]
		});
		const settled = settleHours({ devlogs: { d1: 60 } }, evidence, 2);
		expect(settled.collaborators.a.journals).toBe(60);
		expect(settled.collaborators.b.lapse).toBe(mins(1));
		// Program split stays proportional (90/120 vs 30/120).
		expect(settled.collaborators.a.program).toBe(90);
		expect(settled.collaborators.b.program).toBe(30);
		expect(settled.approvedMinutes).toBe(60 + mins(1) + 120);
	});

	test('replay is deterministic: stored adjustments re-derive the same settlement', () => {
		const evidence = collabEvidence({
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: mins(2), afterLastCommitMinutes: 0, programMinutes: 0 },
				{ makerId: 'b', hackatimeMinutes: mins(6.5), afterLastCommitMinutes: 0, programMinutes: 0 }
			]
		});
		const first = settleHours({ hackatime: { b: mins(5) }, devlogs: {} }, evidence, 2);
		const replay = settleHours(first.adjustments, evidence, 2);
		expect(replay).toEqual(first);
	});
});

describe('settlement v2 degraded-capture fallback', () => {
	test('empty tracked columns + surviving coding seconds settle the v1 way', () => {
		// A stale/partial capture: tracked columns never written, but a prior
		// healthy capture left commit coding seconds behind.
		const evidence = collabEvidence({
			commits: [{ id: 'c1', codingSeconds: mins(2) * 60, makerId: 'a' }],
			hours: { hackatimeMinutes: 0, afterLastCommitMinutes: mins(1), programMinutes: 0 }
		});
		const v2 = settleHours({}, evidence, 2);
		const v1 = settleHours({}, evidence, 1);
		// v2 falls back to the exact v1 settlement instead of zeroing Hackatime.
		expect(v2).toEqual(v1);
		expect(v2.approvedMinutes).toBe(mins(3));
	});

	test('tracked minutes present: no fallback, commits ignored', () => {
		const evidence = collabEvidence({
			commits: [{ id: 'c1', codingSeconds: mins(2) * 60, makerId: 'a' }],
			hours: { hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 0 },
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: mins(1), afterLastCommitMinutes: 0, programMinutes: 0 },
				{ makerId: 'b', hackatimeMinutes: mins(1), afterLastCommitMinutes: 0, programMinutes: 0 }
			]
		});
		const settled = settleHours({}, evidence, 2);
		expect(settled.breakdown.hackatime).toBe(mins(2));
		expect(settled.approvedMinutes).toBe(mins(2));
	});
});

describe('settlement v1 replay (unchanged)', () => {
	test('commit-anchored crediting still drops unmatched tracked time', () => {
		const evidence = collabEvidence({
			commits: [{ id: 'c1', codingSeconds: mins(2) * 60, makerId: 'a' }],
			hours: { hackatimeMinutes: 0, afterLastCommitMinutes: mins(1), programMinutes: 0 },
			collaborators: [
				{ makerId: 'a', hackatimeMinutes: 0, afterLastCommitMinutes: 0, programMinutes: 0 },
				{ makerId: 'b', hackatimeMinutes: mins(6.5), afterLastCommitMinutes: 0, programMinutes: 0 }
			]
		});
		const settled = settleHours({}, evidence, 1);
		// v1: a gets their commit; the after row counts at ship level but has no
		// per-person weight to allocate to (both captured after-minutes are 0),
		// so it lands on nobody's split; b's tracked minutes never settle - they
		// don't even earn b a per-person entry (callers backfill zero rows).
		expect(settled.collaborators.a.hackatime).toBe(mins(2));
		expect(settled.collaborators.b).toBeUndefined();
		expect(settled.approvedMinutes).toBe(mins(3));
	});
});

describe('per-person deflates (unchanged mechanics on the new splits)', () => {
	test('cut one person without touching teammates, breakdown follows', () => {
		const settled = {
			approvedMinutes: mins(8.5),
			breakdown: { hackatime: mins(8.5), journals: 0, lapse: 0, program: 0 },
			collaborators: {
				a: { total: mins(2), hackatime: mins(2), journals: 0, lapse: 0, program: 0 },
				b: { total: mins(6.5), hackatime: mins(6.5), journals: 0, lapse: 0, program: 0 }
			}
		};
		const { deflates, totalMinutes } = clampCollaboratorDeflates(
			{ b: mins(5) },
			settled.collaborators
		);
		expect(deflates).toEqual({ b: mins(5) });
		expect(totalMinutes).toBe(mins(5));
		const out = applyDeflate(settled, null, deflates);
		expect(out.approvedMinutes).toBe(mins(3.5));
		expect(out.collaborators.b.total).toBe(mins(1.5));
		expect(out.collaborators.a.total).toBe(mins(2));
	});
});
