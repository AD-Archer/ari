<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		checked?: boolean;
		indeterminate?: boolean;
		children?: Snippet;
	}
	let {
		checked = $bindable(false),
		indeterminate = $bindable(false),
		children,
		...rest
	}: Props & Omit<HTMLInputAttributes, 'type'> = $props();
</script>

<label class={{ checkbox: true, disabled: rest.disabled }}>
	<input type="checkbox" bind:checked bind:indeterminate {...rest} />
	{#if children}<span>{@render children()}</span>{/if}
</label>

<style>
	.checkbox {
		display: inline-flex;
		align-items: flex-start;
		gap: var(--space-2);
		font-size: var(--text-sm);
		font-weight: 500;
		line-height: 1.4;
		color: var(--text);
		cursor: pointer;
	}
	.disabled {
		opacity: 0.5;
		cursor: default;
	}
	input {
		appearance: none;
		display: grid;
		place-content: center;
		flex: none;
		width: 18px;
		height: 18px;
		margin: 0;
		border: 2px solid var(--border-2);
		border-radius: var(--radius-sm);
		background: var(--surface);
		cursor: inherit;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	input::before {
		content: '';
		display: none;
		width: 5px;
		height: 9px;
		margin-top: -2px;
		border: solid var(--on-primary);
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}
	input:checked,
	input:indeterminate {
		background: var(--primary);
		border-color: var(--primary);
	}
	input:checked::before,
	input:indeterminate::before {
		display: block;
	}
	input:indeterminate::before {
		width: 8px;
		height: 0;
		margin-top: 0;
		border-width: 0 0 2px;
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		input {
			transition: none;
		}
	}
</style>
