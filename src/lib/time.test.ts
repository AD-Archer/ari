import { describe, expect, test } from 'bun:test';
import {
	applyRate,
	clampSeconds,
	formatClock,
	formatDuration,
	formatDurationCompact,
	formatHoursApprox,
	legacyHoursToSeconds,
	parseDuration,
	scaleToTarget,
	secondsBetween,
	splitProportional,
	toLegacyHours,
	toLegacyMinutes,
	toLegacyMinutesBreakdown
} from './time';

const sumOf = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

describe('splitProportional', () => {
	test('pieces always sum to the total', () => {
		expect(splitProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
		expect(splitProportional(7, [2, 5])).toEqual([2, 5]);
		expect(splitProportional(1, [1, 1])).toEqual([1, 0]);
	});

	test('never loses or invents a second across many shapes', () => {
		let seed = 12345;
		const next = (limit: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % limit;
		};
		for (let round = 0; round < 2000; round++) {
			const weights = Array.from({ length: 1 + next(6) }, () => next(500000));
			const total = next(4000000);
			const pieces = splitProportional(total, weights);
			const expected = sumOf(weights) === 0 ? 0 : total;
			expect(sumOf(pieces)).toBe(expected);
			expect(pieces.every((piece) => Number.isInteger(piece) && piece >= 0)).toBe(true);
		}
	});

	test('zero weights and zero total give zeros', () => {
		expect(splitProportional(50, [0, 0])).toEqual([0, 0]);
		expect(splitProportional(0, [3, 4])).toEqual([0, 0]);
	});

	test('rejects fractional or negative input', () => {
		expect(() => splitProportional(1.5, [1])).toThrow();
		expect(() => splitProportional(10, [-1])).toThrow();
	});
});

describe('scaleToTarget', () => {
	test('only removes time, and lands exactly on the target', () => {
		expect(sumOf(scaleToTarget([3600, 1800, 61], 4000))).toBe(4000);
		expect(scaleToTarget([10, 20], 99)).toEqual([10, 20]);
		expect(scaleToTarget([10, 20], 0)).toEqual([0, 0]);
	});
});

describe('applyRate', () => {
	test('kept plus removed is the original', () => {
		for (const seconds of [0, 1, 2, 3, 100, 3599, 3600, 86399]) {
			const { keptSeconds, removedSeconds } = applyRate(seconds, 1, 3);
			expect(keptSeconds + removedSeconds).toBe(seconds);
		}
	});

	test('a one-third rate keeps a third, with the indivisible second kept', () => {
		expect(applyRate(300, 1, 3)).toEqual({ keptSeconds: 100, removedSeconds: 200 });
		expect(applyRate(100, 1, 3)).toEqual({ keptSeconds: 34, removedSeconds: 66 });
		expect(applyRate(1, 1, 3)).toEqual({ keptSeconds: 1, removedSeconds: 0 });
	});

	test('rejects rates outside 0..1', () => {
		expect(() => applyRate(10, 4, 3)).toThrow();
		expect(() => applyRate(10, 1, 0)).toThrow();
	});
});

describe('clampSeconds', () => {
	test('coerces untrusted input', () => {
		expect(clampSeconds(120, 100)).toBe(100);
		expect(clampSeconds(-5, 100)).toBe(0);
		expect(clampSeconds(59.9, 100)).toBe(59);
		expect(clampSeconds('60', 100)).toBeNull();
		expect(clampSeconds(Number.NaN, 100)).toBeNull();
	});
});

describe('formatting', () => {
	test('formatDuration is exact', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(45)).toBe('45s');
		expect(formatDuration(720)).toBe('12m');
		expect(formatDuration(5400)).toBe('1h 30m');
		expect(formatDuration(5405)).toBe('1h 30m 5s');
		expect(formatDuration(3605)).toBe('1h 5s');
	});

	test('formatClock', () => {
		expect(formatClock(725)).toBe('12:05');
		expect(formatClock(5405)).toBe('1:30:05');
	});

	test('formatHoursApprox rounds for labels', () => {
		expect(formatHoursApprox(43200)).toBe('12');
		expect(formatHoursApprox(8784)).toBe('2.4');
	});

	test('formatDurationCompact keeps the two largest units and truncates', () => {
		expect(formatDurationCompact(0)).toBe('0s');
		expect(formatDurationCompact(59)).toBe('59s');
		expect(formatDurationCompact(60)).toBe('1m');
		expect(formatDurationCompact(2759)).toBe('45m');
		expect(formatDurationCompact(3600)).toBe('1h');
		expect(formatDurationCompact(19859)).toBe('5h 30m');
		expect(formatDurationCompact(86399)).toBe('23h 59m');
		expect(formatDurationCompact(86400)).toBe('1d');
		expect(formatDurationCompact(89999)).toBe('1d');
		expect(formatDurationCompact(190799)).toBe('2d 4h');
	});

	test('secondsBetween counts whole seconds and never goes negative', () => {
		const start = new Date('2026-03-10T00:00:00.000Z');
		expect(secondsBetween(start, new Date('2026-03-10T00:00:00.999Z'))).toBe(0);
		expect(secondsBetween(start, new Date('2026-03-10T00:00:01.000Z'))).toBe(1);
		expect(secondsBetween(start, new Date('2026-03-12T04:00:00.500Z'))).toBe(187200);
		expect(secondsBetween(new Date('2026-03-10T00:00:05.000Z'), start)).toBe(0);
	});
});

describe('parseDuration', () => {
	test('reads the forms people type', () => {
		expect(parseDuration('1h 30m')).toBe(5400);
		expect(parseDuration('1h30m5s')).toBe(5405);
		expect(parseDuration('90m')).toBe(5400);
		expect(parseDuration('45s')).toBe(45);
		expect(parseDuration('1:30:00')).toBe(5400);
		expect(parseDuration('12:05')).toBe(725);
		expect(parseDuration('90')).toBe(5400);
	});

	test('round-trips formatDuration', () => {
		for (const seconds of [0, 1, 59, 60, 3599, 3600, 5405, 86399, 360000]) {
			expect(parseDuration(formatDuration(seconds))).toBe(seconds);
		}
	});

	test('rejects what it cannot read exactly', () => {
		expect(parseDuration('')).toBeNull();
		expect(parseDuration('1.5h')).toBeNull();
		expect(parseDuration('abc')).toBeNull();
		expect(parseDuration('1:75')).toBeNull();
	});
});

describe('legacy wire fields', () => {
	test('match what minute-based payloads produced', () => {
		expect(toLegacyMinutes(5400)).toBe(90);
		expect(toLegacyMinutes(5429)).toBe(90);
		expect(toLegacyMinutes(5430)).toBe(91);
		expect(toLegacyHours(5400)).toBe(1.5);
		expect(toLegacyHours(8784)).toBe(2.4);
	});
});

// the same vector is asserted in ari-webhooks: both emitters must agree on it
describe('shared seconds contract vector', () => {
	test('legacy fields derive from the settled seconds', () => {
		const sources = [5429, 1830, 29, 0];
		const approvedSeconds = sumOf(sources);
		expect(approvedSeconds).toBe(7288);
		expect(toLegacyMinutes(approvedSeconds)).toBe(121);
		expect(toLegacyHours(approvedSeconds)).toBe(2);
		expect(toLegacyMinutesBreakdown(approvedSeconds, sources)).toEqual([90, 30, 1, 0]);
	});

	test('splitProportional', () => {
		expect(splitProportional(100, [1, 1, 1])).toEqual([34, 33, 33]);
		expect(splitProportional(1, [1, 1])).toEqual([1, 0]);
		expect(splitProportional(7, [2, 5])).toEqual([2, 5]);
	});

	test('toLegacyMinutes rounds half up', () => {
		expect(toLegacyMinutes(5400)).toBe(90);
		expect(toLegacyMinutes(5429)).toBe(90);
		expect(toLegacyMinutes(5430)).toBe(91);
		expect(toLegacyMinutes(29)).toBe(0);
		expect(toLegacyMinutes(30)).toBe(1);
	});

	test('legacyHoursToSeconds settles on whole minutes like the old app did', () => {
		expect(legacyHoursToSeconds(1.5)).toBe(5400);
		expect(legacyHoursToSeconds(0.21)).toBe(780);
		expect(legacyHoursToSeconds(0)).toBeNull();
		expect(legacyHoursToSeconds(Number.NaN)).toBeNull();
	});
});
