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
	}
	let { kind, rowId, capturedSeconds, label }: Props = $props();

	const { draft, settlement } = useReview();
	const reduced = $derived(settlement.rowReduced(kind, rowId));
</script>

<span class={{ timeRowEditor: true, reduced }}>
	<span class="field">
		<DurationField
			bare
			label="Credited {label}"
			name="railSeconds-{kind}-{rowId}"
			emptyAs="zero"
			seconds={draft.rowSeconds(kind, rowId, capturedSeconds)}
			maxSeconds={capturedSeconds}
			onCommit={(seconds) => draft.setRowSeconds(kind, rowId, seconds ?? 0, capturedSeconds)}
		/>
	</span>
	<span class="captured" title="Captured time">/ {formatDuration(capturedSeconds)}</span>
	{#if reduced}
		<Button
			size="sm"
			variant="quiet"
			icon="refresh"
			aria-label="Reset credited {label} to the captured {formatDuration(capturedSeconds)}"
			title="Reset to captured"
			onclick={() => draft.setRowSeconds(kind, rowId, capturedSeconds, capturedSeconds)}
		/>
	{/if}
</span>

<style>
	.timeRowEditor {
		display: inline-flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-1);
		min-width: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}
	.field {
		flex: none;
		/* fits 4h 35m 57s in the mono face */
		width: 108px;
	}
	.captured {
		color: var(--text-3);
	}
	.reduced .field :global(input) {
		border-color: var(--color-orange);
		color: var(--color-orange);
	}
</style>
