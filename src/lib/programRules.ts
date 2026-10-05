import type { Evidence } from '$lib/data';

export const evidenceKinds: Evidence[] = ['commits', 'elapsed', 'devlog'];

export interface ProgramDraft {
	name: string;
	accent: string;
	evidence: Evidence[];
	organizers: string[];
	poc: string;
	allowVms: boolean;
	secondPass: boolean;
	reviewersChannel: string;
	trackingStartsAt: string;
	secondPassApproved: boolean;
	secondPassChanges: boolean;
	secondPassRejected: boolean;
	secondPassOrganizerBypass: boolean;
	cantReviewOwn: boolean;
	allowDeflation: boolean;
	hoursJustification: boolean;
	priorityReview: boolean;
	reviewerReauth: boolean;
	reviewerReauthTtlMinutes: string;
	reviewGoal: string;
}

// mirrors the schema defaults of a fresh program
export const emptyProgramDraft = (): ProgramDraft => ({
	name: '',
	accent: '#338eda',
	evidence: ['commits', 'elapsed'],
	organizers: [],
	poc: '',
	allowVms: false,
	secondPass: false,
	reviewersChannel: '',
	trackingStartsAt: '',
	secondPassApproved: true,
	secondPassChanges: true,
	secondPassRejected: true,
	secondPassOrganizerBypass: true,
	cantReviewOwn: false,
	allowDeflation: true,
	hoursJustification: true,
	priorityReview: false,
	reviewerReauth: false,
	reviewerReauthTtlMinutes: '60',
	reviewGoal: '50'
});

export const parseEvidence = (raw: string[]): Evidence[] => {
	const sent = raw.flatMap((value) => value.split(',')).map((value) => value.trim());
	return evidenceKinds.filter((kind) => sent.includes(kind));
};

export const parseEmails = (raw: string[]): string[] =>
	raw.map((value) => value.trim().toLowerCase()).filter(Boolean);

export const wholeNumber = (raw: string): number => Number(raw.trim());

export const nameProblem = (name: string): string | null =>
	name.trim() ? null : 'A program name is required.';

export const channelFormatMessage = () =>
	'Reviewers channel must be a Slack channel id (like C0123ABCDEF) or a link to the channel.';

export const trackingStartDate = (raw: string): Date => new Date(raw.trim() + 'T00:00:00Z');

export function trackingStartProblem(raw: string): string | null {
	if (!raw.trim()) return 'A tracking start date is required.';
	if (Number.isNaN(trackingStartDate(raw).getTime())) return 'Tracking start must be a valid date.';
	return null;
}

export function reauthTtlProblem(enabled: boolean, minutes: number): string | null {
	if (!enabled) return null;
	return Number.isInteger(minutes) && minutes >= 1 && minutes <= 100000
		? null
		: 'Re-auth inactivity timeout must be between 1 and 100000 minutes.';
}

export const reviewGoalProblem = (goal: number): string | null =>
	Number.isInteger(goal) && goal >= 1 && goal <= 10000
		? null
		: 'Weekly review goal must be between 1 and 10000.';

export type WizardStepId = 'basics' | 'evidence' | 'reviewFlow' | 'people';

// the channel is verified against slack separately: the step also needs that check to pass
export function stepProblem(step: WizardStepId, draft: ProgramDraft): string | null {
	if (step === 'basics')
		return nameProblem(draft.name) ?? trackingStartProblem(draft.trackingStartsAt);
	if (step === 'reviewFlow')
		return (
			reauthTtlProblem(draft.reviewerReauth, wholeNumber(draft.reviewerReauthTtlMinutes)) ??
			reviewGoalProblem(wholeNumber(draft.reviewGoal))
		);
	return null;
}

export const editProblem = (draft: ProgramDraft): string | null => nameProblem(draft.name);
