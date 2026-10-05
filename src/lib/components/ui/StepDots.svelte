<script lang="ts">
	interface Props {
		steps: { id: string; label: string }[];
		current: number;
		label?: string;
		onSelect?: (index: number) => void;
	}
	let { steps, current, label, onSelect }: Props = $props();
</script>

<div class="stepDots" role="group" aria-label={label ?? `Step ${current + 1} of ${steps.length}`}>
	{#each steps as step, index (step.id)}
		<button
			type="button"
			class={['dot', index === current && 'current', index < current && 'done']}
			aria-label={step.label}
			aria-current={index === current ? 'step' : undefined}
			title={step.label}
			disabled={index > current}
			onclick={() => onSelect?.(index)}
		></button>
	{/each}
</div>

<style>
	.stepDots {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.dot {
		display: grid;
		place-content: center;
		width: var(--space-5);
		height: var(--space-5);
		padding: 0;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		cursor: pointer;
	}
	.dot::before {
		content: '';
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--radius-full);
		background: var(--border-2);
		transition:
			width 0.16s,
			background 0.16s;
	}
	.dot:disabled {
		cursor: default;
	}
	.done::before {
		background: color-mix(in srgb, var(--primary) 55%, var(--surface));
	}
	.current::before {
		width: var(--space-5);
		background: var(--primary);
	}
	.current {
		width: var(--space-6);
	}
</style>
