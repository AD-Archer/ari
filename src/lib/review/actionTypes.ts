import type { Decision, ProblemCode, ReviewProblem } from '$lib/review/reviewRules';
import type { ReviewMaker } from '$lib/review/reviewTypes';

export type DispatchOutcome =
	| 'queued'
	| 'noEndpoint'
	| 'notSigned'
	| 'blockedUrl'
	| 'noDecision'
	| 'failed';

export type FailureCode =
	| ProblemCode
	| 'notFound'
	| 'selfReview'
	| 'reauthRequired'
	| 'staleIngest'
	| 'blocked'
	| 'noReview'
	| 'newerShipOpen'
	| 'invalid'
	| 'trackPermission'
	| 'vmUnavailable'
	| 'vmFailed'
	| 'uploadFailed'
	| 'resyncFailed'
	| 'signedOut';

export interface ActionFailure {
	error: string;
	code: FailureCode;
	problems?: ReviewProblem[];
	locked?: true;
	closed?: true;
	reauth?: true;
	// where to send the browser to re-verify
	url?: string;
	by?: string;
}

export type ActionOutcome<Data> =
	| { ok: true; data: Data }
	| { ok: false; status: number; failure: ActionFailure };

export interface DecisionResult {
	success: true;
	decision: Decision;
	// held waits for second pass, parked for the private module: nothing was sent
	outcome: 'final' | 'held' | 'parked';
	// what the program is told, after the deflate
	approvedSeconds: number;
	// null when nothing was sent
	webhook: DispatchOutcome | null;
}

export interface ConfirmResult {
	success: true;
	decision: Decision;
	overridden: boolean;
	approvedSeconds: number;
	webhook: DispatchOutcome;
}

export interface OverrideResult {
	success: true;
	webhook: DispatchOutcome;
}

export interface ShipEditResult {
	success: true;
	unchanged?: true;
	changed?: number;
	// null when nothing was sent
	webhook?: DispatchOutcome;
	resyncQueued?: boolean;
	resyncError?: string;
}

export interface TimelineItem {
	id: string;
	kind:
		| 'submitted'
		| 'opened'
		| 'closed'
		| 'approved'
		| 'changes'
		| 'rejected'
		| 'reverted'
		| 'vmLaunch'
		| 'vmStop'
		| 'vmReap'
		| 'priority'
		| 'edit';
	iso: string;
	ago: string;
	whenLabel: string;
	who: { name: string; color: string; slackId: string | null } | null;
	detail: string;
	changes?: { label: string; from: string; to: string }[];
}

export interface MakerInfo extends ReviewMaker {
	slackUsername: string | null;
	slackDisplayName: string | null;
}
