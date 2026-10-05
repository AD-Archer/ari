import type { ReviewContext } from './reviewContext.svelte';
import type { ReviewDraft } from './reviewDraft.svelte';

export type WizardStep = 'checklist' | 'notes' | 'fields';

const stepLabels: Record<WizardStep, string> = {
	checklist: 'Checklist',
	notes: 'Notes',
	fields: 'Details'
};

// a live review walks one section at a time. anything else shows every section at once
export class Wizard {
	index = $state(0);

	readonly #context: ReviewContext;
	readonly #draft: ReviewDraft;

	constructor(context: ReviewContext, draft: ReviewDraft) {
		this.#context = context;
		this.#draft = draft;

		$effect.pre(() => {
			void context.shipKey;
			this.index = 0;
		});
	}

	// false on a decided, held or read-only ship: render all sections flat
	readonly active = $derived.by(() => this.#context.reviewing);

	// the checklist step also carries the earlier feedback to confirm, the details step only
	// exists when the program has custom fields
	readonly steps: WizardStep[] = $derived.by(() => [
		...(this.#context.data.checklist.length || this.#context.data.fixes.length
			? (['checklist'] as const)
			: []),
		'notes',
		...(this.#context.data.customFields.length ? (['fields'] as const) : [])
	]);

	readonly current: WizardStep = $derived(this.steps[Math.min(this.index, this.steps.length - 1)]);
	readonly onFirstStep = $derived(this.index <= 0);
	// the decision buttons live on the last step
	readonly onLastStep = $derived(this.index >= this.steps.length - 1);
	readonly nextStep: WizardStep | null = $derived(this.steps[this.index + 1] ?? null);

	label(step: WizardStep): string {
		return stepLabels[step];
	}

	// whether a section renders: always when flat, else only as the current step
	shows(step: WizardStep): boolean {
		return !this.active || this.current === step;
	}

	back(): void {
		if (this.active && this.index > 0) this.index -= 1;
	}

	next(): void {
		if (this.active && !this.onLastStep) this.index += 1;
	}

	goTo(step: WizardStep): void {
		const position = this.steps.indexOf(step);
		if (this.active && position >= 0) this.index = position;
	}

	// which step holds the input a problem names
	stepOf(field: string): WizardStep {
		if (field === 'checklist' || field === 'fixChecks') return 'checklist';
		return field.startsWith('field:') ? 'fields' : 'notes';
	}

	#checklistDone(): boolean {
		const { checks, fixChecks } = this.#draft.value;
		return (
			checks.every(Boolean) &&
			this.#context.data.fixes.every((fix) => fixChecks.includes(fix.reviewId))
		);
	}

	// ticking the last box moves on, after a beat so the tick is seen landing
	advanceWhenChecklistDone(): void {
		const ready = () =>
			this.active && this.current === 'checklist' && !this.onLastStep && this.#checklistDone();
		if (!ready()) return;
		setTimeout(() => {
			if (ready()) this.index += 1;
		}, 200); // 200ms: long enough to see the tick, short enough not to wait
	}
}
