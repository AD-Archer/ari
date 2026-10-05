<script lang="ts">
	import { Button, Dialog, StepDots } from '$lib/components/ui';
	import BasicsStep from './steps/BasicsStep.svelte';
	import EvidenceStep from './steps/EvidenceStep.svelte';
	import PeopleStep from './steps/PeopleStep.svelte';
	import ReviewFlowStep from './steps/ReviewFlowStep.svelte';
	import type { BoardPerson } from './boardTypes';
	import { wizardSteps, type ProgramWizard } from './programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
		people: BoardPerson[];
		onSaved: (saved: { name: string; createdId: string | null }) => void;
	}
	let { wizard, people, onSaved }: Props = $props();

	const step = $derived(wizard.step);

	async function save() {
		const saved = await wizard.save();
		if (saved) onSaved(saved);
	}
</script>

<Dialog
	bind:open={wizard.open}
	size="lg"
	icon={wizard.editing ? 'settings' : 'plus'}
	title={wizard.editing ? 'Configure program' : `Create a program · ${step.label}`}
	description={wizard.editing
		? 'More options (checklist, snippets, webhooks) live in program settings.'
		: step.description}
>
	<div class="steps">
		{#if wizard.editing}
			<BasicsStep {wizard} />
			<EvidenceStep {wizard} />
			<ReviewFlowStep {wizard} />
			<PeopleStep {wizard} {people} />
		{:else if step.builtIn === 'basics'}
			<BasicsStep {wizard} />
		{:else if step.builtIn === 'evidence'}
			<EvidenceStep {wizard} />
		{:else if step.builtIn === 'reviewFlow'}
			<ReviewFlowStep {wizard} />
		{:else if step.builtIn === 'people'}
			<PeopleStep {wizard} {people} />
		{:else if step.component}
			<step.component values={wizard.stepValues} setValue={wizard.setStepValue} />
		{/if}
	</div>
	{#snippet footer()}
		<div class="lead">
			{#if !wizard.editing}
				<StepDots steps={wizardSteps} current={wizard.stepIndex} onSelect={wizard.goTo} />
			{/if}
			{#if wizard.blocked}<span class="blocked" role="status">{wizard.blocked}</span>{/if}
		</div>
		<Button variant="quiet" disabled={wizard.saving} onclick={() => (wizard.open = false)}>
			Cancel
		</Button>
		{#if !wizard.editing && wizard.stepIndex > 0}
			<Button icon="arrowL" disabled={wizard.saving} onclick={wizard.back}>Back</Button>
		{/if}
		{#if !wizard.editing && !wizard.lastStep}
			<Button
				variant="primary"
				iconAfter="arrowR"
				disabled={Boolean(wizard.blocked)}
				onclick={wizard.next}
			>
				Next
			</Button>
		{:else}
			<Button
				variant="primary"
				icon={wizard.editing ? 'check' : 'plus'}
				loading={wizard.saving}
				disabled={Boolean(wizard.blocked)}
				onclick={save}
			>
				{wizard.editing ? 'Save changes' : 'Create program'}
			</Button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.steps {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.lead {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.blocked {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
</style>
