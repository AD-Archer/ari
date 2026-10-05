<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	interface Props {
		label: string;
		value?: string;
		shortcutHint?: string;
		element?: HTMLInputElement;
	}
	let {
		label,
		value = $bindable(''),
		shortcutHint,
		element = $bindable(),
		...rest
	}: Props & HTMLInputAttributes = $props();
</script>

<label class="searchField">
	<Icon name="search" size={16} />
	<input
		type="search"
		aria-label={label}
		autocomplete="off"
		bind:value
		bind:this={element}
		{...rest}
	/>
	{#if shortcutHint && !value}<kbd aria-hidden="true">{shortcutHint}</kbd>{/if}
</label>

<style>
	.searchField {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		height: var(--control-md);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text-3);
		cursor: text;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.searchField:focus-within {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		outline: none;
	}
	input:focus-visible {
		box-shadow: none;
	}
	input::placeholder {
		color: var(--text-3);
	}
	input::-webkit-search-cancel-button {
		appearance: none;
	}
	kbd {
		flex: none;
		padding: 1px var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--space-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
</style>
