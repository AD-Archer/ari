<script lang="ts">
	import { Button, DurationField } from '$lib/components/ui';
	import type { AdjustmentKind } from '$lib/review/state/draftSeed';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';

	interface Props {
		kind: AdjustmentKind;
		rowId: string;
		capturedSeconds: number;
		label: string;
		// false for view data, whatever the lock says
		editable?: boolean;
	}
	let { kind, rowId, capturedSeconds, label, editable = true }: Props = $props();

	const { draft, settlement } = useReview();

	const canEdit = $derived(editable && draft.timeEditable);
	const reduced = $derived(settlement.rowReduced(kind, rowId));
</script>

<span class={{ secondsEditor: true, reduced }}>
	{#if canEdit}
		<span class="field">
			<DurationField
				bare
				label="Credited time for {label}"
				name="rowSeconds-{kind}-{rowId}"
				emptyAs="zero"
				data-row-seconds
				seconds={draft.rowSeconds(kind, rowId, capturedSeconds)}
				maxSeconds={capturedSeconds}
				onCommit={(seconds) => draft.setRowSeconds(kind, rowId, seconds ?? 0, capturedSeconds)}
			/>
		</span>
		<span class="captured" title="Captured time">/ {formatDuration(capturedSeconds)}</span>
	{:else}
		<span class="credited"
			>{formatDuration(settlement.rowSeconds(kind, rowId, capturedSeconds))}</span
		>
		{#if reduced}
			<span class="captured" title="Captured time">/ {formatDuration(capturedSeconds)}</span>
		{/if}
	{/if}
	{#if reduced}
		<span class="mark">deflated</span>
		{#if canEdit}
			<Button
				size="sm"
				variant="quiet"
				icon="refresh"
				aria-label="Reset credited time for {label} to the captured {formatDuration(
					capturedSeconds
				)}"
				title="Reset to captured"
				onclick={() => draft.setRowSeconds(kind, rowId, capturedSeconds, capturedSeconds)}
			/>
		{/if}
	{/if}
</span>

<style>
	.secondsEditor {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}
	.field {
		flex: none;
		width: 92px;
	}
	.captured {
		color: var(--text-3);
	}
	.credited {
		color: var(--text);
	}
	.reduced .credited,
	.mark {
		color: var(--color-orange);
	}
	.mark {
		font-family: var(--font-sans);
	}
	.reduced .field :global(input) {
		border-color: var(--color-orange);
		color: var(--color-orange);
	}
</style>
