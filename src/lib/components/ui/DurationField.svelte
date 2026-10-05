<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { formatDuration, parseDuration } from '$lib/time';
	import Field from './Field.svelte';

	interface Props {
		label: string;
		name: string;
		seconds?: number | null;
		maxSeconds?: number;
		// what an empty field means: no value, or zero seconds
		emptyAs?: 'none' | 'zero';
		// only the input, named by the label for assistive tech
		bare?: boolean;
		hint?: string;
		error?: string | null;
		onCommit?: (seconds: number | null) => void;
	}
	let {
		label,
		name,
		seconds = $bindable(null),
		maxSeconds,
		emptyAs = 'none',
		bare = false,
		hint,
		error,
		onCommit,
		id,
		...rest
	}: Props & Omit<HTMLInputAttributes, 'value' | 'type'> = $props();

	const shown = (value: number | null) => (value === null ? '' : formatDuration(value));

	// what is being typed. null between edits, when the field shows the value from outside
	let typed = $state<string | null>(null);
	let unreadable = $state(false);
	const text = $derived(typed ?? shown(seconds));

	function commit() {
		if (typed === null) return;
		const trimmed = typed.trim();
		const parsed = trimmed ? parseDuration(trimmed) : emptyAs === 'zero' ? 0 : null;
		unreadable = Boolean(trimmed) && parsed === null;
		// an unreadable entry stays in the field to be corrected
		if (unreadable) return;
		const next =
			parsed !== null && maxSeconds !== undefined ? Math.min(parsed, maxSeconds) : parsed;
		typed = null;
		seconds = next;
		onCommit?.(next);
	}

	const shownError = $derived(unreadable ? 'Use a duration like 1h 30m, 90m or 1:30:00.' : error);
</script>

{#snippet control(controlId: string, describedBy: string | undefined, invalid: boolean)}
	<input
		id={controlId}
		{name}
		type="text"
		inputmode="text"
		autocomplete="off"
		class={{ invalid, bare }}
		aria-label={bare ? label : undefined}
		aria-describedby={describedBy}
		aria-invalid={invalid || undefined}
		value={text}
		oninput={(event) => (typed = event.currentTarget.value)}
		onblur={commit}
		{...rest}
	/>
{/snippet}

{#if bare}
	{@render control(id ?? name, undefined, Boolean(shownError))}
{:else}
	<Field {label} id={id ?? name} {hint} error={shownError} required={Boolean(rest.required)}>
		{#snippet children(field)}
			{@render control(field.id, field.describedBy, field.invalid)}
		{/snippet}
	</Field>
{/if}

<style>
	input {
		width: 100%;
		height: var(--control-lg);
		padding: 0 var(--space-3);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-md);
		outline: none;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	input.bare {
		height: var(--control-sm);
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		text-align: right;
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
</style>
