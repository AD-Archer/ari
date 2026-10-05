import { describe, expect, test } from 'bun:test';
import { addDays, addMonths, clampIso, monthWeeks, parseIso, toIso, weekday } from './dateGrid';

describe('dateGrid', () => {
	test('formats and parses iso dates', () => {
		expect(toIso(2026, 0, 5)).toBe('2026-01-05');
		expect(parseIso('2026-02-31')).toBeNull();
		expect(parseIso('nope')).toBeNull();
		expect(parseIso('2024-02-29')?.getUTCDate()).toBe(29);
	});

	test('steps days across month and year ends', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
	});

	test('clamps the day when the target month is shorter', () => {
		expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
		expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
		expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
		expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
	});

	test('clamps to bounds', () => {
		expect(clampIso('2026-01-01', '2026-01-10', '2026-01-20')).toBe('2026-01-10');
		expect(clampIso('2026-02-01', '2026-01-10', '2026-01-20')).toBe('2026-01-20');
		expect(clampIso('2026-01-15')).toBe('2026-01-15');
	});

	test('lays a month out in sunday-first weeks', () => {
		const weeks = monthWeeks('2026-10-03');
		expect(weekday('2026-10-01')).toBe(4);
		expect(weeks).toHaveLength(5);
		expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03']);
		expect(weeks[4][6]).toBe('2026-10-31');
		expect(weeks.every((week) => week.length === 7)).toBe(true);
	});
});
