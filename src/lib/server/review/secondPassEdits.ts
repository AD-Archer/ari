import { readDecisionForm } from '$lib/review/decisionForm';
import { collaboratorNotesFor, type Decision } from '$lib/review/reviewRules';
import { db } from '$lib/server/db';
import type { TimeRequest } from '$lib/server/review/heldReview';

const textColumns = {
	note: 'noteToMaker',
	audit: 'auditNote',
	technicalFeatures: 'technicalFeatures',
	deflationReason: 'deflationReason'
} as const;

type TextKey = keyof typeof textColumns;
type TextColumn = (typeof textColumns)[TextKey];
export type HeldTexts = Record<TextColumn, string>;

export interface HeldReviewRow extends HeldTexts {
	decision: Decision;
	fieldValues: unknown;
	collaboratorNotes: unknown;
}

export interface ConfirmEdits {
	texts: HeldTexts;
	textsChanged: boolean;
	fieldValues: Record<string, unknown>;
	fieldsChanged: boolean;
	decision: Decision;
	decisionChanged: boolean;
	collaboratorNotes: Record<string, string>;
	collaboratorNotesChanged: boolean;
	// the organizer's time request: held values stand for whatever the form left out
	time: TimeRequest;
	ingestVersion: number | null;
}

// unknown keys and malformed values are dropped, never an error: the held values stand
async function fieldPatch(programId: string, posted: Record<string, unknown>) {
	const definitions = await db.reviewField.findMany({
		where: { programId },
		select: { key: true, type: true }
	});
	const typeByKey = new Map(definitions.map((definition) => [definition.key, definition.type]));
	const patch: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(posted)) {
		const type = typeByKey.get(key);
		if (!type) continue;
		if (type === 'checkbox') patch[key] = value === true || value === 'true';
		else if (type === 'multiselect')
			patch[key] = Array.isArray(value)
				? value
						.filter((entry): entry is string => typeof entry === 'string')
						.map((entry) => entry.slice(0, 500)) // 500 characters per value
				: [];
		else if (typeof value === 'string' || typeof value === 'number')
			patch[key] = String(value).slice(0, 500); // 500 characters per value
	}
	return patch;
}

export async function readConfirmEdits(
	form: FormData | null,
	review: HeldReviewRow,
	held: TimeRequest,
	programId: string,
	knownMakerIds: string[]
): Promise<ConfirmEdits> {
	const parsed = readDecisionForm(form ?? new FormData());
	const { draft, posted } = parsed;

	const texts = {} as HeldTexts;
	let textsChanged = false;
	for (const key of Object.keys(textColumns) as TextKey[]) {
		const column = textColumns[key];
		const stored = review[column];
		const edited = posted.has(key) && draft[key].trim() !== stored.trim();
		texts[column] = edited ? draft[key].trim() : stored;
		textsChanged ||= edited;
	}

	const storedFields = (review.fieldValues ?? {}) as Record<string, unknown>;
	const patch = posted.has('fieldValues') ? await fieldPatch(programId, draft.fieldValues) : {};
	const fieldsChanged = Object.keys(patch).length > 0;

	const rawDecision = form?.get('decision');
	const decision =
		rawDecision === 'approved' || rawDecision === 'changes' || rawDecision === 'rejected'
			? rawDecision
			: review.decision;

	const storedNotes = (review.collaboratorNotes ?? {}) as Record<string, string>;
	const collaboratorNotes = posted.has('collaboratorNotes')
		? collaboratorNotesFor(draft.collaboratorNotes, knownMakerIds)
		: storedNotes;

	return {
		texts,
		textsChanged,
		fieldValues: fieldsChanged ? { ...storedFields, ...patch } : storedFields,
		fieldsChanged,
		decision,
		decisionChanged: decision !== review.decision,
		collaboratorNotes,
		collaboratorNotesChanged: JSON.stringify(collaboratorNotes) !== JSON.stringify(storedNotes),
		time: {
			adjustments: posted.has('adjustments') ? draft.adjustments : held.adjustments,
			deflateSeconds: posted.has('deflateSeconds') ? draft.deflateSeconds : held.deflateSeconds,
			collaboratorDeflates: posted.has('collaboratorDeflates')
				? draft.collaboratorDeflates
				: held.collaboratorDeflates
		},
		ingestVersion: parsed.ingestVersion
	};
}
