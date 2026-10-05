<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		label: string;
		description?: string;
		checked?: boolean;
	}
	let {
		label,
		description,
		checked = $bindable(false),
		...rest
	}: Props & Omit<HTMLInputAttributes, 'type' | 'role'> = $props();

	const uid = $props.id();
	const descriptionId = $derived(description ? `${uid}Description` : undefined);
</script>

<label class={{ toggle: true, disabled: rest.disabled }}>
	<span class="text">
		<span class="label">{label}</span>
		{#if description}<span class="description" id={descriptionId}>{description}</span>{/if}
	</span>
	<input type="checkbox" role="switch" aria-describedby={descriptionId} bind:checked {...rest} />
</label>

<style>
	.toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		cursor: pointer;
	}
	.disabled {
		opacity: 0.5;
		cursor: default;
	}
	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.label {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
	}
	.description {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	input {
		appearance: none;
		position: relative;
		flex: none;
		width: calc(var(--space-5) + var(--space-4));
		height: var(--space-5);
		margin: 0;
		border: 1px solid var(--border-2);
		border-radius: var(--radius-full);
		background: var(--surface-3);
		cursor: inherit;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	input::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		/* track height minus its two 1px borders and the two 2px insets */
		width: calc(var(--space-5) - 6px);
		height: calc(var(--space-5) - 6px);
		border-radius: 50%;
		background: var(--on-primary);
		box-shadow: var(--shadow-sm);
		transition: transform 0.15s;
	}
	input:checked {
		background: var(--primary);
		border-color: var(--primary);
	}
	input:checked::before {
		transform: translateX(var(--space-4));
	}
	@media (prefers-reduced-motion: reduce) {
		input,
		input::before {
			transition: none;
		}
	}
</style>
