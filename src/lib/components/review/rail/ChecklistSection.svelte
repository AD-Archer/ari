<script lang="ts">
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import ChecklistPanel from './ChecklistPanel.svelte';
	import FixVerification from './FixVerification.svelte';

	const { context } = useReview();
</script>

{#if context.data.fixes.length}
	<FixVerification />
{/if}
{#if context.data.checklist.length}
	<ChecklistPanel />
{/if}
