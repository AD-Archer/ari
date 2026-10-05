import { describe, expect, test } from 'bun:test';
import {
	afterLastCommitKey,
	programKey,
	soloHackatimeKey,
	applyDeflate,
	clampCollaboratorDeflates,
	settle,
	type Evidence
} from './settlement';
import { settleHours } from '$lib/server/settlementLegacy';

const soloEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
	commits: [],
	devlogs: [],
	clips: [],
	ship: { hackatimeSeconds: 0, afterLastCommitSeconds: 0, programSeconds: 0 },
	collaborators: [],
	...overrides
});

const person = (makerId: string, hackatimeSeconds: number, programSeconds = 0) => ({
	makerId,
	hackatimeSeconds,
	afterLastCommitSeconds: 0,
	programSeconds
});

const sourceSum = (seconds: {
	hackatime: number;
	journals: number;
	lapse: number;
	program: number;
}) => seconds.hackatime + seconds.journals + seconds.lapse + seconds.program;

describe('settle', () => {
	test('credits every captured second when nothing is adjusted', () => {
		const settled = settle(
			{},
			soloEvidence({
				devlogs: [{ id: 'devlogOne', seconds: 2707 }], // 45m 7s: 45 * 60 + 7
				clips: [{ id: 'clipOne', lengthSeconds: 3912 }], // 1h 5m 12s: 3600 + 5 * 60 + 12
				ship: { hackatimeSeconds: 14431, afterLastCommitSeconds: 0, programSeconds: 59 } // 4h 31s: 4 * 3600 + 31
			})
		);
		expect(settled.breakdown).toEqual({
			hackatime: 14431, // 4h 31s: 4 * 3600 + 31
			journals: 2707, // 45m 7s: 45 * 60 + 7
			lapse: 3912, // 1h 5m 12s: 3600 + 5 * 60 + 12
			program: 59
		});
		expect(settled.approvedSeconds).toBe(sourceSum(settled.breakdown));
		expect(settled.adjustments).toEqual({
			devlogs: {},
			clips: {},
			hackatime: {},
			program: {},
			commits: {},
			after: {}
		});
	});

	test('keeps seconds that minute rounding used to drop', () => {
		// the minute-based settlement rounded each 29s clip to zero
		const clips = ['clipOne', 'clipTwo', 'clipThree'].map((id) => ({ id, lengthSeconds: 29 }));
		expect(settle({}, soloEvidence({ clips })).approvedSeconds).toBe(87);
		const legacy = settleHours({}, { commits: [], devlogs: [], clips }, 2);
		expect(legacy.approvedMinutes).toBe(0);
	});

	test('adjustments only reduce, and are clamped to what was captured', () => {
		const settled = settle(
			{
				hackatime: { [soloHackatimeKey]: 10800 }, // 3h: 3 * 3600
				devlogs: { devlogOne: 356400, devlogTwo: -5 }, // 99h: 99 * 3600
				program: { [programKey]: 'lots' }
			},
			soloEvidence({
				devlogs: [
					{ id: 'devlogOne', seconds: 600 },
					{ id: 'devlogTwo', seconds: 300 }
				],
				ship: { hackatimeSeconds: 14400, afterLastCommitSeconds: 0, programSeconds: 120 } // 4h: 4 * 3600
			})
		);
		expect(settled.breakdown).toEqual({
			hackatime: 10800, // 3h: 3 * 3600
			journals: 600,
			lapse: 0,
			program: 120
		});
		expect(settled.adjustments.hackatime).toEqual({ [soloHackatimeKey]: 10800 }); // 3h: 3 * 3600
		expect(settled.adjustments.devlogs).toEqual({ devlogTwo: 0 });
		expect(settled.adjustments.program).toEqual({});
	});

	test('collaborative: each person is credited their own tracked seconds', () => {
		const settled = settle(
			{ hackatime: { makerB: 18000 } }, // 5h: 5 * 3600
			soloEvidence({
				devlogs: [{ id: 'devlogOne', seconds: 1800, makerId: 'makerA' }],
				ship: {
					hackatimeSeconds: 30600, // 8h 30m: 8 * 3600 + 30 * 60
					afterLastCommitSeconds: 0,
					programSeconds: 0
				},
				collaborators: [person('makerA', 7200), person('makerB', 23400)] // 2h: 2 * 3600, 6h 30m: 6 * 3600 + 30 * 60
			})
		);
		expect(settled.collaborators.makerA).toEqual({
			total: 9000, // 2h 30m: 2 * 3600 + 1800
			hackatime: 7200, // 2h: 2 * 3600
			journals: 1800,
			lapse: 0,
			program: 0
		});
		expect(settled.collaborators.makerB.hackatime).toBe(18000); // 5h: 5 * 3600
		expect(settled.approvedSeconds).toBe(27000); // 7h 30m: 7 * 3600 + 1800
	});

	test('program time splits across people without losing a second', () => {
		const settled = settle(
			{},
			soloEvidence({
				ship: { hackatimeSeconds: 0, afterLastCommitSeconds: 0, programSeconds: 100 },
				collaborators: [person('makerA', 0, 1), person('makerB', 0, 1), person('makerC', 0, 1)]
			})
		);
		const shares = Object.values(settled.collaborators).map((share) => share.program);
		expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
		expect(settled.breakdown.program).toBe(100);
	});

	test('degraded capture falls back to commit-anchored time', () => {
		const settled = settle(
			{ commits: { commitTwo: 100 }, after: { [afterLastCommitKey]: 30 } },
			soloEvidence({
				commits: [
					{ id: 'commitOne', codingSeconds: 1234 },
					{ id: 'commitTwo', codingSeconds: 500 }
				],
				ship: { hackatimeSeconds: 0, afterLastCommitSeconds: 61, programSeconds: 0 }
			})
		);
		expect(settled.breakdown.hackatime).toBe(1234 + 100 + 30);
		expect(settled.adjustments.commits).toEqual({ commitTwo: 100 });
	});

	test('a healthy capture ignores commits', () => {
		const settled = settle(
			{},
			soloEvidence({
				commits: [{ id: 'commitOne', codingSeconds: 9999 }],
				ship: { hackatimeSeconds: 100, afterLastCommitSeconds: 50, programSeconds: 0 }
			})
		);
		expect(settled.breakdown.hackatime).toBe(100);
	});

	test('per-person totals always re-sum, across many random ships', () => {
		let seed = 987654321;
		const next = (limit: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % limit;
		};
		for (let round = 0; round < 500; round++) {
			const makerIds = Array.from({ length: 1 + next(4) }, (_item, index) => `maker${index}`);
			const collaborators = makerIds.map(
				(makerId) => person(makerId, next(72000), next(10800)) // 20h: 20 * 3600, 3h: 3 * 3600
			);
			const evidence = soloEvidence({
				devlogs: Array.from({ length: next(5) }, (_item, index) => ({
					id: `devlog${index}`,
					seconds: next(7200), // 2h: 2 * 3600
					makerId: makerIds[next(makerIds.length)]
				})),
				clips: Array.from({ length: next(4) }, (_item, index) => ({
					id: `clip${index}`,
					lengthSeconds: next(7200), // 2h: 2 * 3600
					makerId: makerIds[next(makerIds.length)]
				})),
				ship: {
					hackatimeSeconds: collaborators.reduce((sum, each) => sum + each.hackatimeSeconds, 0),
					afterLastCommitSeconds: 0,
					programSeconds: next(18000) // 5h: 5 * 3600
				},
				collaborators
			});
			const settled = settle({ hackatime: { maker0: next(36000) } }, evidence); // 10h: 10 * 3600

			expect(settled.approvedSeconds).toBe(sourceSum(settled.breakdown));
			const people = Object.values(settled.collaborators);
			for (const each of people) expect(each.total).toBe(sourceSum(each));
			const programWeights = collaborators.reduce((sum, each) => sum + each.programSeconds, 0);
			if (programWeights > 0) {
				expect(people.reduce((sum, each) => sum + each.total, 0)).toBe(settled.approvedSeconds);
			}

			const cut = next(settled.approvedSeconds + 1);
			const deflated = applyDeflate(settled, cut);
			expect(deflated.approvedSeconds).toBe(settled.approvedSeconds - cut);
			expect(sourceSum(deflated.breakdown)).toBe(deflated.approvedSeconds);
			for (const each of Object.values(deflated.collaborators)) {
				expect(each.total).toBe(sourceSum(each));
			}
		}
	});
});

describe('applyDeflate', () => {
	const settled = settle(
		{},
		soloEvidence({
			devlogs: [{ id: 'devlogOne', seconds: 3600, makerId: 'makerA' }], // 1h: 60 * 60
			ship: { hackatimeSeconds: 18000, afterLastCommitSeconds: 0, programSeconds: 0 }, // 5h: 5 * 3600
			collaborators: [person('makerA', 7200), person('makerB', 10800)] // 2h: 2 * 3600, 3h: 3 * 3600
		})
	);

	test('no cut returns the settlement unchanged', () => {
		expect(applyDeflate(settled, 0)).toBe(settled);
		expect(applyDeflate(settled, null)).toBe(settled);
	});

	test('a flat cut scales every view to the same total', () => {
		const deflated = applyDeflate(settled, 3601); // 1h 1s: 3600 + 1
		expect(deflated.approvedSeconds).toBe(17999); // 5h - 1s: 5 * 3600 - 1
		expect(sourceSum(deflated.breakdown)).toBe(17999); // 5h - 1s: 5 * 3600 - 1
		const peopleTotal = Object.values(deflated.collaborators).reduce(
			(sum, each) => sum + each.total,
			0
		);
		expect(peopleTotal).toBe(17999); // 5h - 1s: 5 * 3600 - 1
	});

	test('a cut larger than the total stops at zero', () => {
		expect(applyDeflate(settled, 356400).approvedSeconds).toBe(0); // 99h: 99 * 3600
	});

	test('per-person cuts touch only the named person', () => {
		const deflated = applyDeflate(settled, 1800, { makerB: 1800, stranger: 500 });
		expect(deflated.collaborators.makerA).toEqual(settled.collaborators.makerA);
		expect(deflated.collaborators.makerB.total).toBe(9000); // 3h - 30m: 3 * 3600 - 1800
		expect(deflated.approvedSeconds).toBe(19800); // 6h - 30m: 6 * 3600 - 1800
		expect(sourceSum(deflated.breakdown)).toBe(deflated.approvedSeconds);
	});

	test('clampCollaboratorDeflates drops strangers and clamps to the total', () => {
		expect(
			clampCollaboratorDeflates(
				{ makerA: 356400, stranger: 5, makerB: 0 }, // 99h: 99 * 3600
				settled.collaborators
			)
		).toEqual({ deflates: { makerA: 10800 }, totalSeconds: 10800 }); // 3h: 3 * 3600
	});
});
