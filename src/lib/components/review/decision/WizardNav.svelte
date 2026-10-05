<script lang="ts">
	import { Button, Kbd, StepDots } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	interface Props {
		blocked: boolean;
	}
	let { blocked }: Props = $props();

	const { wizard, keybinds } = useReview();

	const steps = $derived(wizard.steps.map((step) => ({ id: step, label: wizard.label(step) })));
</script>

{#snippet back()}
	<Button
		size="sm"
		variant="quiet"
		icon="arrowL"
		title={keybinds.title('wizBack')}
		data-wizard="back"
		onclick={() => wizard.back()}
	>
		Back <Kbd keys={keybinds.label('wizBack')} />
	</Button>
{/snippet}

{#if wizard.active && wizard.steps.length > 1}
	<div class="progress" data-review-region="wizardProgress">
		{#if !wizard.onFirstStep}{@render back()}{/if}
		<StepDots
			{steps}
			current={wizard.index}
			onSelect={(index) => wizard.goTo(wizard.steps[index])}
		/>
		<p>
			Step {wizard.index + 1} of {wizard.steps.length} · {wizard.label(wizard.current)}
		</p>
	</div>
	{#if !wizard.onLastStep}
		<Button
			variant="soft"
			block
			iconAfter="arrowR"
			disabled={blocked}
			title={keybinds.title('wizNext')}
			data-wizard="next"
			onclick={() => wizard.next()}
		>
			Next: {wizard.nextStep ? wizard.label(wizard.nextStep) : ''}
			<Kbd keys={keybinds.label('wizNext')} />
		</Button>
	{/if}
{/if}

<style>
	.progress {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
	}
	p {
		flex: 1;
		margin: 0;
		color: var(--text-3);
		font-size: var(--text-xs);
		font-weight: 600;
		text-align: right;
	}
</style>
