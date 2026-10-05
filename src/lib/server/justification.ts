// field names and comma-separated formats are a wire contract: receivers paste them verbatim
export interface JustificationBlock {
	hackatime_projects?: string;
	hackatime_user_id?: string;
	lapse_links?: string;
	technical_features?: string;
	deflation_reason?: string;
	time_evidence?: string;
	supporting_evidence?: string;
	hours_reasoning?: string;
	additional_justification?: string;
}

export interface JustificationInput {
	hackatimeProjects: string[];
	hackatimeUserId: string | null;
	trackingFromAt: Date | null;
	receivedAt: Date;
	lapseUrls: (string | null | undefined)[];
	technicalFeatures: string;
	deflationReason: string;
	timeEvidence?: string;
	supportingEvidence?: string;
	hoursReasoning?: string;
	additionalJustification?: string;
}

// utc, matching the utc-day buckets the evidence window is built on
function handbookDate(date: Date): string {
	return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

export function buildJustification(input: JustificationInput): JustificationBlock | undefined {
	const block: JustificationBlock = {};

	const projects = input.hackatimeProjects.map((project) => project.trim()).filter(Boolean);
	if (projects.length) {
		// an unknown window start yields bare project names, never an invented range
		const range = input.trackingFromAt
			? ` ${handbookDate(input.trackingFromAt)}-${handbookDate(input.receivedAt)}`
			: '';
		block.hackatime_projects = projects.map((project) => `${project}${range}`).join(', ');

		const userId = input.hackatimeUserId?.trim();
		if (userId) block.hackatime_user_id = userId;
	}

	const links = input.lapseUrls
		.map((url) => url?.trim())
		.filter((url): url is string => Boolean(url));
	if (links.length) block.lapse_links = links.join(', ');

	const features = input.technicalFeatures.trim();
	if (features) block.technical_features = features;

	const deflation = input.deflationReason.trim();
	if (deflation) block.deflation_reason = deflation;

	const timeEvidence = input.timeEvidence?.trim();
	if (timeEvidence) block.time_evidence = timeEvidence;
	const supporting = input.supportingEvidence?.trim();
	if (supporting) block.supporting_evidence = supporting;
	const reasoning = input.hoursReasoning?.trim();
	if (reasoning) block.hours_reasoning = reasoning;
	const additional = input.additionalJustification?.trim();
	if (additional) block.additional_justification = additional;

	return Object.keys(block).length ? block : undefined;
}

export function isDeflated(
	adjustments: unknown,
	deflateMinutes: number | null | undefined
): boolean {
	if ((deflateMinutes ?? 0) > 0) return true;
	// settleHours only records a key when the settled value is below captured
	const groups = (adjustments ?? {}) as Record<string, unknown>;
	return Object.values(groups).some(
		(group) => typeof group === 'object' && group !== null && Object.keys(group).length > 0
	);
}
