import type { Track } from '$db';
import { buildJustification } from '$lib/server/justification';
import { shipAuthorName } from '$lib/server/serialize';
import type { CollaboratorMinutes } from '$lib/server/settlementLegacy';
import type { CollaboratorSeconds, SourceSeconds } from '$lib/review/settlement';
import { legacyMinutes } from '$lib/server/settlementStore';
import { minutesToSeconds, toLegacyHours, toLegacyMinutes } from '$lib/time';

export const outboundEvent = {
	approved: 'review.approved',
	changes: 'review.changes',
	rejected: 'review.rejected'
} as const;

export type Decision = 'approved' | 'changes' | 'rejected';

export type ShipEditChange = {
	field: string;
	label: string;
	from: string | string[] | null;
	to: string | string[] | null;
};

type PersonSource = {
	email: string;
	name: string | null;
	slackId: string | null;
	hackatimeUserId: string | null;
};

type ShipSnapshotSource = {
	title: string;
	description: string | null;
	track: Track;
	thumbnailUrl: string | null;
	repoUrl: string;
	demoUrl: string | null;
	hackatimeProjects: string[];
	authorNameOverrides: unknown;
	maker: PersonSource;
	collaborators: { maker: PersonSource }[];
};

export interface DispatchInput {
	event: string;
	decision: Decision | null;
	programId: string;
	submissionId: string;
	reviewerId: string;
	note: string;
	auditNote?: string;
	approvedMinutes?: number;
	minutesBreakdown?: Record<string, number>;
	collaboratorMinutes?: CollaboratorMinutes;
	// a version 3 settlement sets these instead of the minute fields above
	approvedSeconds?: number;
	secondsBreakdown?: SourceSeconds;
	collaboratorSeconds?: CollaboratorSeconds;
	collaboratorNotes?: Record<string, string>;
	fields?: Record<string, unknown>;
	technicalFeatures?: string;
	deflationReason?: string;
	// only a review recorded by the earlier flow has these: no decision collects them now
	timeEvidence?: string;
	supportingEvidence?: string;
	hoursReasoning?: string;
	additionalJustification?: string;
}

export type ReviewSubmissionSource = Omit<ShipSnapshotSource, 'collaborators'> & {
	id: string;
	externalId: string;
	priority: boolean;
	receivedAt: Date;
	collaborators: { makerId: string; maker: PersonSource }[];
	hours: { trackingFromAt: Date | null } | null;
	clips: { url: string | null }[];
	program: { hoursJustification: boolean; priorityReview: boolean };
};

export interface ReviewPayloadSource {
	input: DispatchInput;
	submission: ReviewSubmissionSource;
	reviewer: { email: string; slackId: string | null } | null;
	fieldDefinitions: { key: string; label: string; type: string }[];
}

// frozen wire field, one decimal: 60 minutes in an hour
const wireHours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10;

const sourceBreakdown = (sources: SourceSeconds): SourceSeconds => ({
	hackatime: sources.hackatime,
	journals: sources.journals,
	lapse: sources.lapse,
	program: sources.program
});

// version 3: the legacy fields are derived from the settled seconds
function secondsTimeFields(totalSeconds: number, sources: SourceSeconds | undefined) {
	return {
		approved_minutes: toLegacyMinutes(totalSeconds),
		approved_hours: toLegacyHours(totalSeconds),
		approved_seconds: totalSeconds,
		...(sources
			? {
					minutes_breakdown: sourceBreakdown(legacyMinutes(totalSeconds, sources)),
					seconds_breakdown: sourceBreakdown(sources)
				}
			: {})
	};
}

// versions 1 and 2: the minute fields are the settlement, seconds only restate them
function minutesTimeFields(
	totalMinutes: number | undefined,
	breakdown: Record<string, number> | undefined
) {
	return {
		...(totalMinutes !== undefined
			? {
					approved_minutes: totalMinutes,
					approved_hours: wireHours(totalMinutes),
					approved_seconds: minutesToSeconds(totalMinutes)
				}
			: {}),
		...(breakdown
			? {
					minutes_breakdown: breakdown,
					seconds_breakdown: Object.fromEntries(
						Object.entries(breakdown).map(([source, minutes]) => [
							source,
							minutesToSeconds(minutes)
						])
					)
				}
			: {})
	};
}

export function buildShipSnapshot(submission: ShipSnapshotSource) {
	const people = submission.collaborators.length
		? submission.collaborators.map((collaborator) => collaborator.maker)
		: [submission.maker];
	return {
		title: submission.title,
		description: submission.description,
		track: submission.track,
		thumbnail_url: submission.thumbnailUrl,
		authors: people.map((maker) => ({
			email: maker.email,
			name: shipAuthorName(submission, maker)
		})),
		repo_url: submission.repoUrl,
		demo_url: submission.demoUrl,
		hackatime_projects: submission.hackatimeProjects
	};
}

// key order is the wire format: the queued bytes are JSON.stringify of this object
export function buildReviewPayload(source: ReviewPayloadSource) {
	const { input, submission, reviewer } = source;

	const review: Record<string, unknown> = {
		note_to_maker: input.note,
		reviewer: reviewer ? { email: reviewer.email, slack_id: reviewer.slackId } : null
	};
	if (input.auditNote !== undefined) review.audit_note = input.auditNote;
	Object.assign(
		review,
		input.approvedSeconds !== undefined
			? secondsTimeFields(input.approvedSeconds, input.secondsBreakdown)
			: minutesTimeFields(input.approvedMinutes, input.minutesBreakdown)
	);
	if (input.fields) {
		const fieldValues = input.fields;
		review.fields = source.fieldDefinitions.map((definition) => ({
			key: definition.key,
			label: definition.label,
			type: definition.type,
			value: fieldValues[definition.key] ?? null
		}));
	}

	const justification = submission.program.hoursJustification
		? buildJustification({
				hackatimeProjects: submission.hackatimeProjects,
				hackatimeUserId: submission.maker.hackatimeUserId,
				trackingFromAt: submission.hours?.trackingFromAt ?? null,
				receivedAt: submission.receivedAt,
				lapseUrls: submission.clips.map((clip) => clip.url),
				technicalFeatures: input.technicalFeatures ?? '',
				deflationReason: input.deflationReason ?? '',
				timeEvidence: input.timeEvidence,
				supportingEvidence: input.supportingEvidence,
				hoursReasoning: input.hoursReasoning,
				additionalJustification: input.additionalJustification
			})
		: undefined;
	if (justification) review.justification = justification;

	const collaborators = submission.collaborators.length
		? submission.collaborators.map((collaborator) => {
				const minutes = input.collaboratorMinutes?.[collaborator.makerId];
				const seconds = input.collaboratorSeconds?.[collaborator.makerId];
				const personNote = input.collaboratorNotes?.[collaborator.makerId];
				return {
					email: collaborator.maker.email,
					name: shipAuthorName(submission, collaborator.maker),
					slack_id: collaborator.maker.slackId,
					hackatime_id: collaborator.maker.hackatimeUserId,
					...(personNote ? { note_to_maker: personNote } : {}),
					...(seconds
						? secondsTimeFields(seconds.total, seconds)
						: minutes
							? minutesTimeFields(minutes.total, sourceBreakdown(minutes))
							: {})
				};
			})
		: undefined;

	return {
		event: input.event,
		decision: input.decision,
		id: submission.id,
		external_id: submission.externalId,
		...(submission.program.priorityReview ? { priority: submission.priority } : {}),
		maker: {
			email: submission.maker.email,
			name: shipAuthorName(submission, submission.maker),
			slack_id: submission.maker.slackId
		},
		...(collaborators ? { collaborators } : {}),
		ship: buildShipSnapshot(submission),
		review
	};
}

export interface ShipUpdatedSource {
	submissionId: string;
	externalId: string;
	changes: ShipEditChange[];
	ship: ReturnType<typeof buildShipSnapshot>;
	editor: { email: string; slackId: string | null } | null;
}

export function buildShipUpdatedPayload(source: ShipUpdatedSource) {
	return {
		event: 'ship.updated',
		id: source.submissionId,
		external_id: source.externalId,
		ship: source.ship,
		edited_by: source.editor
			? { email: source.editor.email, slack_id: source.editor.slackId }
			: null,
		changes: source.changes.map((change) => ({
			field: change.field,
			old_value: change.from,
			new_value: change.to
		}))
	};
}
