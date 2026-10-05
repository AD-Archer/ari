<script lang="ts">
	import { Textarea } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	const { draft, validation } = useReview();
	const locked = $derived(!draft.editable);
</script>

<!-- a locked rail shows what was written, not an empty box -->
{#if !locked || draft.value.technicalFeatures.trim() || validation.shown.length}
	<div data-review-field="technicalFeatures">
		<Textarea
			label="Technical features"
			name="technicalFeatures"
			hint="Internal. The specific features that account for these hours: required to approve."
			autoGrow
			rows={2}
			readonly={locked}
			error={validation.errorFor('technicalFeatures')}
			bind:value={draft.value.technicalFeatures}
		/>
	</div>
{/if}
