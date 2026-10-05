import { goto, invalidateAll } from '$app/navigation';
import { submitAction } from '$lib/actions';
import { toast } from '$lib/toast.svelte';
import { decisionFormBody } from '$lib/review/decisionForm';
import { overrideProblems, returnProblems, type ReviewProblem } from '$lib/review/reviewRules';
import type { ConfirmResult, OverrideResult } from '$lib/review/reviewTypes';
import { confirmFormBody, confirmToast, decisionOf, webhookProblem } from './decisionOutcome';
import type { DecisionParts, RefusalHandler } from './reviewDecision.svelte';

export type ConfirmAction = 'confirm' | 'confirmChanges' | 'confirmReject';
export type SecondPassBusy = ConfirmAction | 'return' | 'revert' | 'requeue';

type Posted<Result> = Result & Record<string, unknown>;

// resolving a held ship (confirm, override, return) and overriding a decided one (revert,
// requeue). every method resolves to false when nothing changed, so its dialog stays open
export class SecondPass {
	busy = $state<SecondPassBusy | null>(null);

	readonly #parts: DecisionParts;
	readonly #refusal: RefusalHandler;

	constructor(parts: DecisionParts, refusal: RefusalHandler) {
		this.#parts = parts;
		this.#refusal = refusal;
	}

	#actionUrl(): string {
		const { context } = this.#parts;
		return `/p/${context.programId}/review/${context.ship.id}`;
	}

	// the check before a confirm dialog opens, like ReviewDecision.request
	request(action: ConfirmAction): boolean {
		const { validation, reveal } = this.#parts;
		if (validation.attempt(action)) return true;
		const first = validation.problemsFor(action)[0];
		toast.info(first.message, { icon: 'clock' });
		void reveal(first.field);
		return false;
	}

	// confirm ships the held decision, the other two replace it. the organizer's edits to the
	// notes, fields and time ride along
	async confirm(action: ConfirmAction = 'confirm'): Promise<boolean> {
		const { context, draft, validation } = this.#parts;
		if (this.busy || !this.request(action)) return false;
		const title = context.ship.title;
		const advanceHref = context.advanceHref;
		const held = context.heldDecision;
		this.busy = action;
		try {
			const body = confirmFormBody(decisionFormBody(draft.snapshot(), context.ship.ingestVersion), {
				timeEdited: draft.timeEdited,
				decision: action === 'confirm' ? null : decisionOf(action, held)
			});
			const result = await submitAction<Posted<ConfirmResult>>('confirmSecondPass', body, {
				actionUrl: this.#actionUrl(),
				invalidate: false
			});
			if (!result.ok || !result.data) {
				await this.#refusal.handle(action, result);
				return false;
			}
			validation.clear();
			const shown = confirmToast(result.data, title, context.programName);
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

	// what stops a return with this reason. empty when it can go
	returnProblems(reason: string): ReviewProblem[] {
		const { context } = this.#parts;
		return returnProblems({
			reason,
			status: context.ship.status,
			viewer: { canSecondPass: context.viewer.canSecondPass }
		});
	}

	// sends a held ship back to the open queue. takeover keeps the organizer on it, with the
	// held decision as their draft
	async returnToQueue(reason: string, options: { takeover?: boolean } = {}): Promise<boolean> {
		const { context } = this.#parts;
		if (this.busy) return false;
		const problem = this.returnProblems(reason)[0];
		if (problem) {
			toast.info(problem.message);
			return false;
		}
		const title = context.ship.title;
		const advanceHref = context.advanceHref;
		this.busy = 'return';
		try {
			const result = await submitAction(
				'returnSecondPass',
				{
					reason: reason.trim(),
					takeover: options.takeover ? '1' : null
				},
				{ actionUrl: this.#actionUrl(), invalidate: false }
			);
			if (!result.ok) {
				await this.#refusal.handle(null, result);
				return false;
			}
			if (options.takeover) {
				toast.info(`${title} is back on the queue, yours to re-review`, { icon: 'inbox' });
				await invalidateAll();
			} else {
				toast.info(`${title} is back on the queue`, { icon: 'inbox' });
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the route's own program id
				await goto(advanceHref, { invalidateAll: true });
			}
			return true;
		} finally {
			this.busy = null;
		}
	}

	overrideProblems(
		action: 'revert' | 'requeue',
		texts: { publicNote?: string; auditReason: string }
	): ReviewProblem[] {
		const { context } = this.#parts;
		return overrideProblems({
			action,
			publicNote: texts.publicNote ?? '',
			auditReason: texts.auditReason,
			status: context.ship.status,
			viewer: { canOverride: context.viewer.canOverride }
		});
	}

	async #override(
		action: 'revert' | 'requeue',
		texts: { publicNote?: string; auditReason: string },
		done: string
	): Promise<boolean> {
		if (this.busy) return false;
		const problem = this.overrideProblems(action, texts)[0];
		if (problem) {
			toast.info(problem.message);
			return false;
		}
		this.busy = action;
		try {
			const result = await submitAction<Posted<OverrideResult>>(
				action,
				{ public: texts.publicNote ?? null, audit: texts.auditReason },
				{ actionUrl: this.#actionUrl(), invalidate: false }
			);
			if (!result.ok) {
				await this.#refusal.handle(null, result);
				return false;
			}
			toast.info(done, { icon: action === 'revert' ? 'arrowL' : 'inbox' });
			const undelivered = webhookProblem(result.data?.webhook ?? null);
			if (undelivered) toast.error(undelivered);
			await invalidateAll();
			return true;
		} finally {
			this.busy = null;
		}
	}

	// unships a decided ship: the program is told, the ship does not return to the queue
	revert(texts: { publicNote: string; auditReason: string }): Promise<boolean> {
		return this.#override('revert', texts, `Unshipped ${this.#parts.context.ship.title}`);
	}

	// rolls a decision back: the ship reopens as pending
	requeue(auditReason: string): Promise<boolean> {
		return this.#override(
			'requeue',
			{ auditReason },
			`${this.#parts.context.ship.title} is back on the queue`
		);
	}
}
