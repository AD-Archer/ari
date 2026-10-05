<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import Field from './Field.svelte';

	interface Props {
		label: string;
		name: string;
		value?: string;
		options: { value: string; label: string }[];
		hint?: string;
		error?: string | null;
	}
	let {
		label,
		name,
		value = $bindable(''),
		options,
		hint,
		error,
		id,
		...rest
	}: Props & HTMLSelectAttributes = $props();
</script>

<Field {label} id={id ?? name} {hint} {error} required={Boolean(rest.required)}>
	{#snippet children(control)}
		<select
			id={control.id}
			{name}
			class={{ invalid: control.invalid }}
			aria-describedby={control.describedBy}
			aria-invalid={control.invalid || undefined}
			bind:value
			{...rest}
		>
			{#each options as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	{/snippet}
</Field>

<style>
	select {
		width: 100%;
		height: var(--control-lg);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--text-md);
		outline: none;
		cursor: pointer;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	select:focus-visible {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	select:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.invalid {
		border-color: var(--color-red);
	}
</style>
