import { legacyHoursToSeconds, minutesToSeconds } from '$lib/time';
import { draftFromUnknown } from '$lib/review/decisionForm';
import type { Adjustments } from '$lib/review/settlement';
import type { DecisionDraft } from '$lib/review/reviewTypes';

export type AdjustmentKind = keyof Adjustments;
export const adjustmentKinds: AdjustmentKind[] = [
	'devlogs',
	'clips',
	'hackatime',
	'program',
	'commits',
	'after'
];

// the same key the old page wrote, so a draft typed before the switch is still found
export const draftStorageKey = (programName: string, shipId: string): string =>
	`ari-review:${programName}:${shipId}`;

const plainObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export function emptyDraft(): DecisionDraft {
	return draftFromUnknown({});
}

function wholeMinutes(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
	// the old page only ever stored whole minutes: the rounding guards a hand-edited value
	return minutesToSeconds(Math.round(value));
}

function hoursMapToSeconds(raw: unknown): Record<string, number> {
	const seconds: Record<string, number> = {};
	for (const [makerId, hours] of Object.entries(plainObject(raw))) {
		const converted = legacyHoursToSeconds(Number(hours));
		if (converted) seconds[makerId] = converted;
	}
	return seconds;
}

// the old page stored row reductions in minutes and deflates as decimal hours, under other names
function fromLegacyStored(stored: Record<string, unknown>): DecisionDraft {
	const adjustments: Record<string, Record<string, number>> = {};
	for (const [kind, rows] of Object.entries(plainObject(stored.adjust))) {
		for (const [rowId, minutes] of Object.entries(plainObject(rows))) {
			const seconds = wholeMinutes(minutes);
			if (seconds !== null) (adjustments[kind] ??= {})[rowId] = seconds;
		}
	}
	return draftFromUnknown({
		...stored,
		adjustments,
		deflateSeconds: legacyHoursToSeconds(Number(stored.deflate)),
		collaboratorDeflates: hoursMapToSeconds(stored.collabDeflate),
		collaboratorNotes: stored.collabNotes,
		fieldValues: stored.fields
	});
}

export function readStoredDraft(raw: string | null): DecisionDraft | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const stored = parsed as Record<string, unknown>;
	return stored.timeModel === 'seconds' ? draftFromUnknown(stored) : fromLegacyStored(stored);
}

export const serializeStoredDraft = (draft: DecisionDraft): string =>
	JSON.stringify({ timeModel: 'seconds', ...draft });

export interface SeedInput {
	// decided, held, reverted, withdrawn or parked: the screen shows what was recorded
	closed: boolean;
	draft: DecisionDraft | null;
	recorded: DecisionDraft | null;
	// this browser's copy, only used when the server has none
	stored: DecisionDraft | null;
	checklistCount: number;
	fixIds: string[];
}

function copyAdjustments(source: Adjustments | undefined): Required<Adjustments> {
	const adjustments = {} as Required<Adjustments>;
	for (const kind of adjustmentKinds) adjustments[kind] = { ...(source?.[kind] ?? {}) };
	return adjustments;
}

// pure on purpose: it reads the load data and nothing reactive it also writes
export function seedDraft(input: SeedInput): DecisionDraft {
	const source = input.closed ? input.recorded : (input.draft ?? input.stored);
	const base = source ?? emptyDraft();
	const fixIds = new Set(input.fixIds);
	return {
		note: base.note,
		audit: base.audit,
		technicalFeatures: base.technicalFeatures,
		deflationReason: base.deflationReason,
		adjustments: copyAdjustments(base.adjustments),
		deflateSeconds: base.deflateSeconds,
		collaboratorDeflates: { ...base.collaboratorDeflates },
		collaboratorNotes: { ...base.collaboratorNotes },
		fieldValues: { ...base.fieldValues },
		checks:
			base.checks.length === input.checklistCount
				? [...base.checks]
				: new Array<boolean>(input.checklistCount).fill(false),
		// a tick for feedback that is no longer on screen starts over
		fixChecks: base.fixChecks.filter((reviewId) => fixIds.has(reviewId))
	};
}

// row order must not make two equal time requests look different
function canonical(value: unknown): string {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, entry]) => !(entry && typeof entry === 'object' && !Object.keys(entry).length))
		.sort(([first], [second]) => first.localeCompare(second));
	return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

export const timeFingerprint = (
	draft: Pick<DecisionDraft, 'adjustments' | 'deflateSeconds' | 'collaboratorDeflates'>
): string =>
	canonical({
		adjustments: draft.adjustments,
		deflateSeconds: draft.deflateSeconds ?? 0,
		collaboratorDeflates: draft.collaboratorDeflates
	});
