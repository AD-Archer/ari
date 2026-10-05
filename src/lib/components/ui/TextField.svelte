<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Field from './Field.svelte';

	interface Props {
		label: string;
		name: string;
		value?: string;
		mono?: boolean;
		hint?: string;
		error?: string | null;
	}
	let {
		label,
		name,
		value = $bindable(''),
		mono = false,
		hint,
		error,
		id,
		...rest
	}: Props & HTMLInputAttributes = $props();
</script>

<Field {label} id={id ?? name} {hint} {error} required={Boolean(rest.required)}>
	{#snippet children(control)}
		<input
			id={control.id}
			{name}
			class={{ mono, invalid: control.invalid }}
			aria-describedby={control.describedBy}
			aria-invalid={control.invalid || undefined}
			bind:value
			{...rest}
		/>
	{/snippet}
</Field>

<style>
	input {
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
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	input::placeholder {
		color: var(--text-3);
	}
	input:focus-visible {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	input:disabled {
		opacity: 0.5;
	}
	.invalid {
		border-color: var(--color-red);
	}
	.mono {
		font-family: var(--font-mono);
	}
</style>
