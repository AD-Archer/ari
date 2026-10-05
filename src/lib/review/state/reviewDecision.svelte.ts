import { goto, invalidateAll } from '$app/navigation';
import { submitAction, type ActionResult } from '$lib/actions';
import { toast } from '$lib/toast.svelte';
import { decisionFormBody } from '$lib/review/decisionForm';
import type { ActionFailure, DecisionResult } from '$lib/review/reviewTypes';
import { decisionToast, webhookProblem, type ReviewAction } from './decisionOutcome';
import type { ReviewClaim } from './reviewClaim.svelte';
import type { ReviewContext } from './reviewContext.svelte';
import type { ReviewDraft } from './reviewDraft.svelte';
import type { ReviewValidation } from './reviewValidation.svelte';

export type OpenAction = 'approve' | 'changes' | 'reject';

export interface DecisionParts {
	context: ReviewContext;
	claim: ReviewClaim;
	draft: ReviewDraft;
	validation: ReviewValidation;
	reveal: (field: string) => Promise<void>;
}

// what a refused decision-shaped action does on screen. shared with the second-pass module
export class RefusalHandler {
	// the ship's data was replaced while the reviewer was looking at it: offer a reload
	staleIngest = $state(false);

	readonly #parts: DecisionParts;

	constructor(parts: DecisionParts) {
		this.#parts = parts;
		$effect.pre(() => {
			void parts.context.shipKey;
			this.staleIngest = false;
		});
	}

	async handle(action: ReviewAction | null, result: ActionResult): Promise<void> {
		if (result.ok) return;
		const failure = result.data as Partial<ActionFailure> | undefined;
		if (failure?.code === 'reauthRequired' && failure.url) {
			window.location.href = failure.url;
			return;
		}
		toast.error(result.message);
		if (failure?.code === 'staleIngest') {
			this.staleIngest = true;
			return;
		}
		if (action && failure?.problems?.length) {
			this.#parts.validation.refuse(action, failure.problems);
			await this.#parts.reveal(failure.problems[0].field);
		}
		// someone else holds or closed the ship: show it as it is now
		if (
			failure?.code === 'claimHeldByOther' ||
			failure?.code === 'shipClosed' ||
			failure?.code === 'notAwaitingSecondPass' ||
			failure?.code === 'notDecided'
		)
			await invalidateAll();
	}

	async reload(): Promise<void> {
		await invalidateAll();
		this.staleIngest = false;
	}
}

export class ReviewDecision {
	busy = $state<OpenAction | null>(null);

	readonly #parts: DecisionParts;
	readonly refusal: RefusalHandler;

	constructor(parts: DecisionParts, refusal: RefusalHandler) {
		this.#parts = parts;
		this.refusal = refusal;
	}

	// the check before a confirm dialog opens. false, with the first problem toasted and its
	// field in view, when the decision would be refused
	request(action: OpenAction): boolean {
		const { claim, validation, reveal } = this.#parts;
		if (!claim.guardLock()) return false;
		if (validation.attempt(action)) return true;
		const first = validation.problemsFor(action)[0];
		toast.info(first.message, { icon: 'clock' });
		void reveal(first.field);
		return false;
	}

	// records the decision, says what happened to it, then moves to the next ship. resolves
	// to false when nothing was recorded, so a confirm dialog stays open
	async submit(action: OpenAction): Promise<boolean> {
		const { context, claim, draft, validation } = this.#parts;
		if (this.busy || !this.request(action)) return false;
		const shipId = context.ship.id;
		const title = context.ship.title;
		const advanceHref = context.advanceHref;
		this.busy = action;
		draft.holdSaving();
		try {
			const result = await submitAction<DecisionResult & Record<string, unknown>>(
				action,
				decisionFormBody(draft.snapshot(), context.ship.ingestVersion),
				{ actionUrl: `/p/${context.programId}/review/${shipId}`, invalidate: false }
			);
			if (!result.ok || !result.data) {
				draft.resumeSaving();
				await this.refusal.handle(action, result);
				return false;
			}
			claim.decided(shipId);
			draft.discardSaved();
			validation.clear();
			const shown = decisionToast(result.data, title);
			toast.show(shown.message, shown.tone);
			const undelivered = webhookProblem(result.data.webhook);
			if (undelivered) toast.error(undelivered);
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the route's own program id
			await goto(advanceHref, { invalidateAll: true });
			return true;
		} finally {
			this.busy = null;
		}
	}
}
