<script lang="ts" module>
	export interface FieldControl {
		id: string;
		describedBy: string | undefined;
		invalid: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		id: string;
		hint?: string;
		error?: string | null;
		required?: boolean;
		aside?: Snippet;
		children: Snippet<[FieldControl]>;
	}
	let { label, id, hint, error, required = false, aside, children }: Props = $props();

	const hintId = $derived(`${id}Hint`);
	const errorId = $derived(`${id}Error`);
	const describedBy = $derived(
		[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
	);
</script>

<div class="field">
	<div class="labelRow">
		<label for={id}>
			{label}{#if required}<span class="required" aria-hidden="true">*</span>{/if}
		</label>
		{@render aside?.()}
	</div>
	{@render children({ id, describedBy, invalid: Boolean(error) })}
	{#if hint}<p id={hintId}>{hint}</p>{/if}
	{#if error}<p id={errorId} class="error">{error}</p>{/if}
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.labelRow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
	}
	label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-2);
	}
	.required {
		margin-left: 2px;
		color: var(--color-red);
	}
	p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.error {
		font-weight: 600;
		color: var(--color-red);
	}
</style>
