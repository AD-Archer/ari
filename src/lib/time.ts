export function assertSeconds(value: number, label = 'seconds'): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${label} must be a non-negative integer, got ${value}`);
	}
	return value;
}

export function clampSeconds(value: unknown, maxSeconds: number): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(maxSeconds, Math.trunc(value)));
}

export const minutesToSeconds = (minutes: number): number => assertSeconds(minutes, 'minutes') * 60; // seconds in a minute

// the old app stored a deflate as decimal hours and settled it as whole minutes, rounding half up
export function legacyHoursToSeconds(hours: number): number | null {
	if (!Number.isFinite(hours) || hours <= 0) return null;
	return minutesToSeconds(Math.round(hours * 60)); // minutes in an hour
}

export function splitProportional(totalSeconds: number, weights: number[]): number[] {
	assertSeconds(totalSeconds, 'totalSeconds');
	let weightSum = 0n;
	for (const weight of weights) weightSum += BigInt(assertSeconds(weight, 'weight'));
	if (totalSeconds === 0 || weightSum === 0n) return weights.map(() => 0);

	const total = BigInt(totalSeconds);
	const shares = weights.map((weight, index) => {
		const product = total * BigInt(weight);
		return { index, base: product / weightSum, remainder: product % weightSum };
	});
	let leftover = total;
	for (const share of shares) leftover -= share.base;

	const byRemainder = [...shares].sort((first, second) =>
		first.remainder === second.remainder
			? first.index - second.index
			: first.remainder > second.remainder
				? -1
				: 1
	);
	const result = shares.map((share) => Number(share.base));
	for (const share of byRemainder) {
		if (leftover <= 0n) break;
		result[share.index] += 1;
		leftover -= 1n;
	}
	return result;
}

export function scaleToTarget(parts: number[], targetSeconds: number): number[] {
	const currentSum = parts.reduce((sum, part) => sum + assertSeconds(part, 'part'), 0);
	if (targetSeconds >= currentSum) return parts.slice();
	if (targetSeconds <= 0) return parts.map(() => 0);
	return splitProportional(targetSeconds, parts);
}

export function applyRate(
	seconds: number,
	numerator: number,
	denominator: number
): { keptSeconds: number; removedSeconds: number } {
	assertSeconds(seconds);
	if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
		throw new RangeError('rate must be an integer fraction with a positive denominator');
	}
	if (numerator < 0 || numerator > denominator) {
		throw new RangeError('rate must be between 0 and 1');
	}
	// the unsplittable fraction stays with the kept part, so a cut never exceeds its rate
	const removedSeconds = Number(
		(BigInt(seconds) * BigInt(denominator - numerator)) / BigInt(denominator)
	);
	return { keptSeconds: seconds - removedSeconds, removedSeconds };
}

export function formatDuration(seconds: number): string {
	assertSeconds(seconds);
	const hours = Math.floor(seconds / 3600); // seconds in an hour: 60 * 60
	const minutes = Math.floor((seconds % 3600) / 60); // 3600 seconds in an hour: 60 * 60
	const rest = seconds % 60; // seconds in a minute
	const pieces: string[] = [];
	if (hours) pieces.push(`${hours}h`);
	if (minutes) pieces.push(`${minutes}m`);
	if (rest || pieces.length === 0) pieces.push(`${rest}s`);
	return pieces.join(' ');
}

export function formatClock(seconds: number): string {
	assertSeconds(seconds);
	const hours = Math.floor(seconds / 3600); // seconds in an hour: 60 * 60
	const minutes = Math.floor((seconds % 3600) / 60); // 3600 seconds in an hour: 60 * 60
	const rest = String(seconds % 60).padStart(2, '0'); // seconds in a minute
	return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

// rounds: labels only, never store, send or compute with the result
export function formatHoursApprox(seconds: number): string {
	assertSeconds(seconds);
	const tenths = Math.round((seconds * 10) / 3600); // seconds in an hour: 60 * 60
	return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

// truncates to the two largest units: labels only, never store, send or compute with the result
export function formatDurationCompact(seconds: number): string {
	assertSeconds(seconds);
	const days = Math.floor(seconds / 86400); // seconds in a day: 24 * 60 * 60
	const hours = Math.floor((seconds % 86400) / 3600); // 3600 seconds in an hour: 60 * 60
	const minutes = Math.floor((seconds % 3600) / 60); // seconds in a minute
	if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
	if (hours) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
	return minutes ? `${minutes}m` : `${seconds}s`;
}

// whole seconds elapsed, dropping the partial one. an end before the start is zero
export const secondsBetween = (start: Date, end: Date): number =>
	Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000)); // milliseconds in a second

export function parseDuration(input: string): number | null {
	const text = input.trim().toLowerCase();
	if (!text) return null;

	if (/^\d+(:\d{1,2}){1,2}$/.test(text)) {
		const fields = text.split(':').map(Number);
		const [hours, minutes, rest] = fields.length === 3 ? fields : [0, fields[0], fields[1]];
		if (rest >= 60 || (fields.length === 3 && minutes >= 60)) return null;
		return hours * 3600 + minutes * 60 + rest; // 3600 seconds in an hour: 60 * 60
	}

	if (/^\d+$/.test(text)) return Number(text) * 60; // a bare number is minutes

	const unitPattern = /(\d+)\s*(h|m|s)/g;
	if (text.replace(unitPattern, '').trim() !== '') return null;
	let totalSeconds = 0;
	for (const match of text.matchAll(unitPattern)) {
		const amount = Number(match[1]);
		totalSeconds +=
			match[2] === 'h'
				? amount * 3600 // seconds in an hour: 60 * 60
				: match[2] === 'm'
					? amount * 60 // seconds in a minute
					: amount;
	}
	return Number.isSafeInteger(totalSeconds) ? totalSeconds : null;
}

export const toLegacyMinutes = (seconds: number): number =>
	Math.floor((assertSeconds(seconds) + 30) / 60); // rounds half up: 30 is 60 / 2

export const toLegacyHours = (seconds: number): number =>
	Math.round((toLegacyMinutes(seconds) / 60) * 10) / 10; // one decimal: 60 minutes in an hour

export const toLegacyMinutesBreakdown = (totalSeconds: number, sourceSeconds: number[]): number[] =>
	splitProportional(toLegacyMinutes(totalSeconds), sourceSeconds);
