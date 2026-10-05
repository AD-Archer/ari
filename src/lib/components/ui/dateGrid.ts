export function toIso(year: number, month: number, day: number): string {
	return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function parseIso(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	// rejects dates the engine would roll over, like 31 february
	return date.toISOString().slice(0, 10) === value ? date : null;
}

export function todayIso(): string {
	const now = new Date();
	return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(value: string, count: number): string {
	const date = parseIso(value);
	if (!date) return value;
	return toIso(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + count);
}

export function addMonths(value: string, count: number): string {
	const date = parseIso(value);
	if (!date) return value;
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth() + count;
	// day 0 of the following month is the last day of the target month
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	return toIso(year, month, Math.min(date.getUTCDate(), lastDay));
}

export function weekday(value: string): number {
	return parseIso(value)?.getUTCDay() ?? 0;
}

export function clampIso(value: string, min?: string, max?: string): string {
	if (min && value < min) return min;
	if (max && value > max) return max;
	return value;
}

export function monthWeeks(value: string): (string | null)[][] {
	const date = parseIso(value);
	if (!date) return [];
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
	const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const cells: (string | null)[] = [
		...Array.from({ length: lead }, () => null),
		...Array.from({ length: dayCount }, (_empty, offset) => toIso(year, month, offset + 1))
	];
	while (cells.length % 7 !== 0) cells.push(null);
	const weeks: (string | null)[][] = [];
	for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
	return weeks;
}
