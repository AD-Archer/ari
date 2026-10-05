import type { Draft } from '$db';
import { draftFromUnknown } from '$lib/review/decisionForm';
import type { Adjustments } from '$lib/review/settlement';
import type { DecisionDraft, FieldValue } from '$lib/review/reviewTypes';
import { toLegacyMinutes } from '$lib/time';
import { canReviewProgram, trackAllowed, trackScope } from '$lib/server/authz';
import { canActOnSubmission } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { draftColumns } from '$lib/server/settlementStore';
import { storedTimeRequest } from '$lib/server/review/heldReview';

const plainObject = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

const sortedJson = (value: Record<string, unknown>): string =>
	JSON.stringify(
		Object.keys(value)
			.sort()
			.map((key) => [key, value[key]])
	);

function minutesOf(adjustments: unknown): Record<string, unknown> {
	const minutes: Record<string, unknown> = {};
	for (const [kind, rows] of Object.entries(plainObject(adjustments))) {
		const kept: Record<string, number> = {};
		for (const [rowId, seconds] of Object.entries(plainObject(rows))) {
			if (typeof seconds === 'number') kept[rowId] = toLegacyMinutes(seconds);
		}
		if (Object.keys(kept).length) minutes[kind] = sortedJson(kept);
	}
	return minutes;
}

function storedMinutes(adjustments: unknown): Record<string, unknown> {
	const minutes: Record<string, unknown> = {};
	for (const [kind, rows] of Object.entries(plainObject(adjustments))) {
		const kept = plainObject(rows);
		if (Object.keys(kept).length) minutes[kind] = sortedJson(kept);
	}
	return minutes;
}

// old ari writes only the minute columns. when they no longer match the seconds beside them,
// the minutes are the newer edit
function secondsAreCurrent(row: Draft): boolean {
	const deflateMatches =
		(row.deflateSeconds === null ? null : toLegacyMinutes(row.deflateSeconds)) ===
		row.deflateMinutes;
	return (
		deflateMatches &&
		sortedJson(minutesOf(row.adjustmentsSeconds)) === sortedJson(storedMinutes(row.adjustments))
	);
}

export function draftFromRow(row: Draft): DecisionDraft {
	const time = storedTimeRequest({
		settlementVersion: secondsAreCurrent(row) ? 3 : 2,
		adjustments: row.adjustments,
		deflateMinutes: row.deflateMinutes,
		collaboratorDeflates: row.collaboratorDeflates,
		adjustmentsSeconds: row.adjustmentsSeconds,
		deflateSeconds: row.deflateSeconds,
		collaboratorDeflatesSeconds: row.collaboratorDeflatesSeconds
	});
	return {
		note: row.note,
		audit: row.audit,
		technicalFeatures: row.technicalFeatures,
		deflationReason: row.deflationReason,
		adjustments: time.adjustments as Adjustments,
		deflateSeconds: time.deflateSeconds,
		collaboratorDeflates: time.collaboratorDeflates,
		collaboratorNotes: (row.collaboratorNotes ?? {}) as Record<string, string>,
		fieldValues: (row.fieldValues ?? {}) as Record<string, FieldValue>,
		checks: Array.isArray(row.checks) ? row.checks.map((tick) => tick === true) : [],
		fixChecks: Array.isArray(row.fixChecks)
			? row.fixChecks.filter((id): id is string => typeof id === 'string')
			: []
	};
}

export type DraftSaveResult = { ok: true } | { ok: false; status: number; error: string };

// the endpoint skips the layout load, so access and track scope are enforced here
export async function saveDraft(
	user: App.SessionUser | null,
	programId: string,
	submissionId: string,
	body: unknown
): Promise<DraftSaveResult> {
	if (!user) return { ok: false, status: 401, error: 'unauthorized' };
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: { id: true, programId: true, track: true }
	});
	if (!ship) return { ok: false, status: 404, error: 'not_found' };
	if (!canReviewProgram(user, ship.programId))
		return { ok: false, status: 403, error: 'forbidden' };
	if (!trackAllowed(trackScope(user, ship.programId), ship.track))
		return { ok: false, status: 403, error: 'forbidden' };
	// only the claim holder builds a decision on an open ship
	if (!(await canActOnSubmission(ship.id, user.id)))
		return { ok: false, status: 409, error: 'locked' };

	const draft = draftFromUnknown(body);
	const collaboratorNotes: Record<string, string> = {};
	for (const [makerId, text] of Object.entries(draft.collaboratorNotes)) {
		if (text.trim()) collaboratorNotes[makerId] = text.slice(0, 10000); // 10,000 characters per person
	}
	const data = {
		note: draft.note,
		audit: draft.audit,
		technicalFeatures: draft.technicalFeatures,
		deflationReason: draft.deflationReason,
		// raw requests: clamped against the evidence only at decision time
		...draftColumns({
			adjustments: draft.adjustments,
			deflateSeconds: draft.deflateSeconds,
			collaboratorDeflates: draft.collaboratorDeflates
		}),
		collaboratorNotes,
		fieldValues: draft.fieldValues,
		checks: draft.checks,
		fixChecks: draft.fixChecks
	};
	await db.draft.upsert({
		where: { submissionId_reviewerId: { submissionId: ship.id, reviewerId: user.id } },
		create: { submissionId: ship.id, reviewerId: user.id, ...data },
		update: data
	});
	return { ok: true };
}
