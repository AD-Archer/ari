import { minutesToSeconds } from '$lib/time';
import type { Adjustments, PersonSeconds, SourceSeconds } from '$lib/review/settlement';
import { replayLegacyReview } from '$lib/server/outboundRedispatch';
import { replayStoredReview, type SettlementRows } from '$lib/server/settlementStore';
import type { ReportedSeconds } from '$lib/server/review/settlementRows';

export interface StoredReviewTime {
	settlementVersion: number;
	adjustments: unknown;
	deflateMinutes: number | null;
	collaboratorDeflates: unknown;
	adjustmentsSeconds: unknown;
	deflateSeconds: number | null;
	collaboratorDeflatesSeconds: unknown;
}

export const isSecondsReview = (review: { settlementVersion: number }): boolean =>
	review.settlementVersion === 3;

const plainObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

function minutesMapToSeconds(raw: unknown): Record<string, number> {
	const seconds: Record<string, number> = {};
	for (const [key, value] of Object.entries(plainObject(raw))) {
		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) continue;
		seconds[key] = minutesToSeconds(value);
	}
	return seconds;
}

export function adjustmentsMinutesToSeconds(raw: unknown): Adjustments {
	const adjustments: Record<string, Record<string, number>> = {};
	for (const [kind, rows] of Object.entries(plainObject(raw))) {
		const converted = minutesMapToSeconds(rows);
		if (Object.keys(converted).length) adjustments[kind] = converted;
	}
	return adjustments as Adjustments;
}

const positiveOnly = (seconds: Record<string, number>): Record<string, number> =>
	Object.fromEntries(Object.entries(seconds).filter(([, value]) => value > 0));

export interface TimeRequest {
	adjustments: Adjustments;
	deflateSeconds: number | null;
	collaboratorDeflates: Record<string, number>;
}

// the reviewer's reductions in seconds, whichever model recorded them
export function storedTimeRequest(review: StoredReviewTime): TimeRequest {
	if (isSecondsReview(review)) {
		return {
			adjustments: plainObject(review.adjustmentsSeconds) as Adjustments,
			deflateSeconds: review.deflateSeconds,
			collaboratorDeflates: positiveOnly(
				plainObject(review.collaboratorDeflatesSeconds) as Record<string, number>
			)
		};
	}
	return {
		adjustments: adjustmentsMinutesToSeconds(review.adjustments),
		deflateSeconds:
			review.deflateMinutes && review.deflateMinutes > 0
				? minutesToSeconds(review.deflateMinutes)
				: null,
		collaboratorDeflates: positiveOnly(minutesMapToSeconds(review.collaboratorDeflates))
	};
}

type MinuteSources = {
	total: number;
	hackatime: number;
	journals: number;
	lapse: number;
	program: number;
};

const sourcesToSeconds = (minutes: Omit<MinuteSources, 'total'>): SourceSeconds => ({
	hackatime: minutesToSeconds(minutes.hackatime),
	journals: minutesToSeconds(minutes.journals),
	lapse: minutesToSeconds(minutes.lapse),
	program: minutesToSeconds(minutes.program)
});

type LegacyRows = Parameters<typeof replayLegacyReview>[0];

// what a recorded review reports after its deflate, replayed under the model that decided it
export function reportedSeconds(
	review: StoredReviewTime,
	rows: SettlementRows & LegacyRows
): ReportedSeconds {
	if (isSecondsReview(review)) return replayStoredReview(review, rows);
	const { reported } = replayLegacyReview(rows, review);
	const collaborators: Record<string, PersonSeconds> = {};
	for (const [makerId, person] of Object.entries(reported.collaborators)) {
		collaborators[makerId] = {
			...sourcesToSeconds(person),
			total: minutesToSeconds(person.total)
		};
	}
	return {
		approvedSeconds: minutesToSeconds(reported.approvedMinutes),
		breakdown: sourcesToSeconds(reported.breakdown as Omit<MinuteSources, 'total'>),
		collaborators
	};
}
