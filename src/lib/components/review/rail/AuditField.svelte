<script lang="ts">
	import { Textarea } from '$lib/components/ui';
	import { auditLength, auditMinimumLength } from '$lib/review/reviewRules';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	const { context, draft, validation } = useReview();
	// the length rule is the approval's: a closed ship has nothing left to count towards
	const counting = $derived(draft.editable && !context.closed);
</script>

<div data-review-field="audit">
	<Textarea
		label="Justification notes"
		name="audit"
		autoGrow
		rows={2}
		counter={counting}
		countLength={auditLength}
		minlength={counting ? auditMinimumLength() : undefined}
		hint={counting
			? `Internal, never shown to the maker. An approval needs ${auditMinimumLength()} characters.`
			: 'Internal, never shown to the maker.'}
		readonly={!draft.editable}
		error={validation.errorFor('audit')}
		bind:value={draft.value.audit}
	/>
</div>
