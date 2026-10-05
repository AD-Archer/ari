<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import Field from './Field.svelte';

	interface Props {
		label: string;
		name: string;
		value?: string;
		mono?: boolean;
		hint?: string;
		error?: string | null;
		autoGrow?: boolean;
		counter?: boolean;
		countLength?: (text: string) => number;
	}
	let {
		label,
		name,
		value = $bindable(''),
		mono = false,
		hint,
		error,
		autoGrow = false,
		counter = false,
		countLength,
		id,
		rows = 3,
		...rest
	}: Props & HTMLTextareaAttributes = $props();

	let element = $state<HTMLTextAreaElement>();

	// the counter has to count what the rule behind the minimum counts
	const length = $derived(countLength ? countLength(value) : value.length);
	const minimum = $derived(Number(rest.minlength) || 0);
	const maximum = $derived(Number(rest.maxlength) || 0);
	const showCounter = $derived(counter || maximum > 0);
	const tooShort = $derived(minimum > 0 && length < minimum);
	const counterText = $derived(
		maximum > 0
			? `${length} / ${maximum}`
			: tooShort
				? `${length} of ${minimum} minimum`
				: `${length} characters`
	);

	$effect(() => {
		if (!autoGrow || !element) return;
		void value;
		element.style.height = 'auto';
		// scrollHeight leaves out the top and bottom borders
		element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
	});
</script>

{#snippet counterAside()}
	<span class={{ counter: true, tooShort }}>{counterText}</span>
{/snippet}

<Field
	{label}
	id={id ?? name}
	{hint}
	{error}
	required={Boolean(rest.required)}
	aside={showCounter ? counterAside : undefined}
>
	{#snippet children(control)}
		<textarea
			id={control.id}
			{name}
			{rows}
			class={{ mono, autoGrow, invalid: control.invalid }}
			aria-describedby={control.describedBy}
			aria-invalid={control.invalid || undefined}
			bind:this={element}
			bind:value
			{...rest}
		></textarea>
	{/snippet}
</Field>

<style>
	textarea {
		display: block;
		width: 100%;
		min-height: var(--control-lg);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-sans);
		font-size: var(--text-md);
		line-height: 1.45;
		outline: none;
		resize: vertical;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	textarea::placeholder {
		color: var(--text-3);
	}
	textarea:focus-visible {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px var(--ring);
	}
	textarea:disabled {
		opacity: 0.5;
	}
	textarea:disabled,
	textarea:read-only {
		resize: none;
	}
	.autoGrow {
		resize: none;
		overflow: hidden;
	}
	.invalid {
		border-color: var(--color-red);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.counter {
		flex: none;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.tooShort {
		color: var(--color-orange);
	}
</style>
