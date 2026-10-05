<script lang="ts">
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import AuditField from './AuditField.svelte';
	import DeflateField from './DeflateField.svelte';
	import EarlierInputs from './EarlierInputs.svelte';
	import NoteField from './NoteField.svelte';
	import TechnicalFeaturesField from './TechnicalFeaturesField.svelte';

	const { context } = useReview();
	// a decided ship quotes both notes in its summary instead
	const notesQuoted = $derived(context.closed && !context.secondPass);
</script>

<section class="notes" data-review-region="notes">
	{#if !notesQuoted}
		<NoteField />
		<AuditField />
	{/if}
	{#if context.wantsJustification}
		<TechnicalFeaturesField />
	{/if}
	<DeflateField />
	<EarlierInputs />
</section>

<style>
	.notes {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
