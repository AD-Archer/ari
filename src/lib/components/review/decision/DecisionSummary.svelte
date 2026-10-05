<script lang="ts">
	import { KeyValue, type KeyValueItem } from '$lib/components/ui';
	import type { Decision } from '$lib/review/reviewRules';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';
	import NoteQuote from './NoteQuote.svelte';

	interface Props {
		decision: Decision;
		held: boolean;
	}
	let { decision, held }: Props = $props();

	const { context, draft, settlement } = useReview();

	const names = { approved: 'Approve', changes: 'Request changes', rejected: 'Reject' };
	const personalNotes = $derived(
		Object.values(draft.value.collaboratorNotes).filter((note) => note.trim()).length
	);

	const items = $derived<KeyValueItem[]>([
		{ key: 'Decision', value: names[decision] },
		...(decision === 'approved'
			? [
					{
						key: 'Credited time',
						value: formatDuration(settlement.approvedSeconds),
						mono: true
					},
					{
						key: 'Captured',
						value: formatDuration(settlement.capturedSeconds),
						mono: true
					},
					...(settlement.reducedSeconds > 0
						? [
								{
									key: 'Taken off rows',
									value: `−${formatDuration(settlement.reducedSeconds)}`,
									mono: true
								}
							]
						: []),
					...(settlement.deflateSeconds > 0
						? [
								{
									key: 'Deflated',
									value: `−${formatDuration(settlement.deflateSeconds)}`,
									mono: true
								}
							]
						: [])
				]
			: []),
		...(personalNotes > 0
			? [
					{
						key: 'Personal notes',
						value: `${personalNotes} ${personalNotes === 1 ? 'person gets' : 'people get'} their own note`
					}
				]
			: []),
		{
			key: 'Delivery',
			value: held
				? 'Held for second pass. Nothing is sent until an organizer confirms it.'
				: `Sent to ${context.programName} now.`
		}
	]);
</script>

<div class="summary" data-review-region="decisionSummary" data-delivery={held ? 'held' : 'sent'}>
	<KeyValue {items} />
	<NoteQuote label="Note to maker · shared" text={draft.value.note} />
</div>

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
