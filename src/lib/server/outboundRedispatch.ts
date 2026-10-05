import { outboundEvent, type DispatchInput } from '$lib/server/outboundPayload';
import { settleHours, applyDeflate } from '$lib/server/settlementLegacy';
import { replayStoredReview, type SettlementRows } from '$lib/server/settlementStore';

export type RedispatchSource = Parameters<typeof settleHours>[1] &
	SettlementRows & {
		id: string;
		programId: string;
		status: string;
		collaborators: { makerId: string }[];
		reviews: {
			reviewerId: string;
			noteToMaker: string;
			auditNote: string;
			adjustments: unknown;
			settlementVersion: number;
			deflateMinutes: number | null;
			collaboratorDeflates: unknown;
			adjustmentsSeconds: unknown;
			deflateSeconds: number | null;
			collaboratorDeflatesSeconds: unknown;
			collaboratorNotes: unknown;
			fieldValues: unknown;
			technicalFeatures: string;
			deflationReason: string;
			timeEvidence: string;
			supportingEvidence: string;
			hoursReasoning: string;
			additionalJustification: string;
		}[];
	};

function secondsSettlement(
	submission: RedispatchSource,
	review: RedispatchSource['reviews'][number]
): Pick<DispatchInput, 'approvedSeconds' | 'secondsBreakdown' | 'collaboratorSeconds'> {
	const deflated = replayStoredReview(review, submission);
	return {
		approvedSeconds: deflated.approvedSeconds,
		secondsBreakdown: deflated.breakdown,
		collaboratorSeconds: submission.collaborators.length ? deflated.collaborators : undefined
	};
}

type LegacyReview = Pick<
	RedispatchSource['reviews'][number],
	'adjustments' | 'settlementVersion' | 'deflateMinutes' | 'collaboratorDeflates'
>;
type LegacySource = Parameters<typeof settleHours>[1] & { collaborators: { makerId: string }[] };

// a version 1 or 2 review replayed under the frozen minute model that decided it
export function replayLegacyReview(submission: LegacySource, review: LegacyReview) {
	const settled = settleHours(
		review.adjustments,
		submission,
		review.settlementVersion === 2 ? 2 : 1
	);
	for (const collaborator of submission.collaborators) {
		settled.collaborators[collaborator.makerId] ??= {
			total: 0,
			hackatime: 0,
			journals: 0,
			lapse: 0,
			program: 0
		};
	}
	return {
		settled,
		reported: applyDeflate(settled, review.deflateMinutes, review.collaboratorDeflates)
	};
}

function minutesSettlement(
	submission: RedispatchSource,
	review: RedispatchSource['reviews'][number]
): Pick<DispatchInput, 'approvedMinutes' | 'minutesBreakdown' | 'collaboratorMinutes'> {
	const { reported } = replayLegacyReview(submission, review);
	return {
		approvedMinutes: reported.approvedMinutes,
		minutesBreakdown: reported.breakdown,
		collaboratorMinutes: submission.collaborators.length ? reported.collaborators : undefined
	};
}

// replays the decision-time settlement under the version the review was decided with
export function buildRedispatchInput(submission: RedispatchSource): DispatchInput | null {
	const status = submission.status;
	if (status !== 'approved' && status !== 'changes' && status !== 'rejected') return null;
	const lastReview = submission.reviews[0];
	if (!lastReview) return null;

	const storedNotes = (lastReview.collaboratorNotes ?? {}) as Record<string, string>;
	return {
		event: outboundEvent[status],
		decision: status,
		programId: submission.programId,
		submissionId: submission.id,
		reviewerId: lastReview.reviewerId,
		note: lastReview.noteToMaker,
		auditNote: lastReview.auditNote,
		...(lastReview.settlementVersion === 3
			? secondsSettlement(submission, lastReview)
			: minutesSettlement(submission, lastReview)),
		collaboratorNotes: Object.keys(storedNotes).length ? storedNotes : undefined,
		fields: lastReview.fieldValues as Record<string, unknown>,
		technicalFeatures: lastReview.technicalFeatures,
		deflationReason: lastReview.deflationReason,
		timeEvidence: lastReview.timeEvidence,
		supportingEvidence: lastReview.supportingEvidence,
		hoursReasoning: lastReview.hoursReasoning,
		additionalJustification: lastReview.additionalJustification
	};
}
