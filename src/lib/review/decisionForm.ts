import { clampSeconds } from '$lib/time';
import type { Adjustments } from '$lib/review/settlement';
import type { DecisionDraft, FieldValue } from '$lib/review/reviewTypes';

const textKeys = ['note', 'audit', 'technicalFeatures', 'deflationReason'] as const;

const jsonKeys = [
	'adjustments',
	'collaboratorDeflates',
	'collaboratorNotes',
	'fieldValues',
	'checks',
	'fixChecks'
] as const;

export type DecisionFormKey =
	| (typeof textKeys)[number]
	| (typeof jsonKeys)[number]
	| 'deflateSeconds'
	| 'ingestVersion'
	| 'decision';

const plainObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const storableSeconds = (value: unknown): number | null =>
	clampSeconds(typeof value === 'string' && value.trim() ? Number(value) : value, 2147483647) ||
	null; // postgres integer max: 2 ** 31 - 1

function positiveSeconds(raw: unknown): Record<string, number> {
	const seconds: Record<string, number> = {};
	for (const [key, value] of Object.entries(plainObject(raw))) {
		const clamped = storableSeconds(value);
		if (clamped) seconds[key] = clamped;
	}
	return seconds;
}

function stringMap(raw: unknown): Record<string, string> {
	const strings: Record<string, string> = {};
	for (const [key, value] of Object.entries(plainObject(raw))) {
		if (typeof value === 'string') strings[key] = value;
	}
	return strings;
}

// malformed values fall back to empty: the rules then refuse what is missing
export function draftFromUnknown(source: unknown): DecisionDraft {
	const fields = plainObject(source);
	const text = (key: (typeof textKeys)[number]) => String(fields[key] ?? '');
	return {
		note: text('note'),
		audit: text('audit'),
		technicalFeatures: text('technicalFeatures'),
		deflationReason: text('deflationReason'),
		adjustments: plainObject(fields.adjustments) as Adjustments,
		deflateSeconds: storableSeconds(fields.deflateSeconds),
		collaboratorDeflates: positiveSeconds(fields.collaboratorDeflates),
		collaboratorNotes: stringMap(fields.collaboratorNotes),
		fieldValues: plainObject(fields.fieldValues) as Record<string, FieldValue>,
		checks: Array.isArray(fields.checks) ? fields.checks.map((tick) => tick === true) : [],
		fixChecks: Array.isArray(fields.fixChecks)
			? fields.fixChecks.filter((id): id is string => typeof id === 'string')
			: []
	};
}

// the fields every decision-shaped action takes, as submitAction sends them
export function decisionFormBody(
	draft: DecisionDraft,
	ingestVersion: number
): Record<string, string> {
	const body: Record<string, string> = {
		ingestVersion: String(ingestVersion),
		deflateSeconds: draft.deflateSeconds === null ? '' : String(draft.deflateSeconds)
	};
	for (const key of textKeys) body[key] = draft[key];
	for (const key of jsonKeys) body[key] = JSON.stringify(draft[key]);
	return body;
}

export interface ParsedDecisionForm {
	draft: DecisionDraft;
	// which keys the form carried: a second-pass confirm keeps the held value for the rest
	posted: Set<string>;
	ingestVersion: number | null;
}

export function readDecisionForm(form: FormData): ParsedDecisionForm {
	const source: Record<string, unknown> = {};
	const posted = new Set<string>();
	for (const key of textKeys) {
		const value = form.get(key);
		if (typeof value !== 'string') continue;
		source[key] = value;
		posted.add(key);
	}
	for (const key of jsonKeys) {
		const value = form.get(key);
		if (typeof value !== 'string' || !value) continue;
		try {
			source[key] = JSON.parse(value);
			posted.add(key);
		} catch {
			// a malformed optional value reads as absent
		}
	}
	const deflate = form.get('deflateSeconds');
	if (typeof deflate === 'string') {
		source.deflateSeconds = deflate;
		posted.add('deflateSeconds');
	}
	const ingestVersion = Number(form.get('ingestVersion'));
	return {
		draft: draftFromUnknown(source),
		posted,
		ingestVersion: Number.isInteger(ingestVersion) && ingestVersion > 0 ? ingestVersion : null
	};
}
