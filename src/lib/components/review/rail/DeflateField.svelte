<script lang="ts">
	import { DurationField, Textarea } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';

	const { context, draft, settlement, validation } = useReview();

	// collaborative ships deflate per person instead. a locked rail with no deflate shows nothing
	const flat = $derived(
		context.data.rules.allowDeflation &&
			!context.data.collaborators &&
			(draft.timeEditable || draft.value.deflateSeconds !== null)
	);
	const reasonShown = $derived(
		context.wantsJustification &&
			context.data.rules.allowDeflation &&
			(settlement.deflated ||
				Boolean(draft.value.deflationReason.trim()) ||
				validation.problemFor('deflationReason') !== null)
	);
</script>

{#if flat}
	<div data-review-field="deflate">
		<DurationField
			label="Deflate time"
			name="deflateSeconds"
			placeholder="none"
			hint={settlement.deflateSeconds > 0
				? `Cut from the total the program is told: ${formatDuration(settlement.approvedSeconds)} approved.`
				: `Cut from the total the program is told, up to ${formatDuration(settlement.maxDeflateSeconds)}.`}
			disabled={!draft.timeEditable}
			seconds={draft.value.deflateSeconds}
			maxSeconds={settlement.maxDeflateSeconds}
			onCommit={(seconds) => draft.setDeflate(seconds)}
		/>
	</div>
{/if}
{#if reasonShown}
	<div data-review-field="deflationReason">
		<Textarea
			label="Why deflated"
			name="deflationReason"
			hint="Internal. Needed whenever less than the captured time is credited."
			autoGrow
			rows={2}
			required={settlement.deflated}
			readonly={!draft.editable}
			error={validation.errorFor('deflationReason')}
			bind:value={draft.value.deflationReason}
		/>
	</div>
{/if}
