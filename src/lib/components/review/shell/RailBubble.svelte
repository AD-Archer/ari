<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	const { rail } = useReview();
</script>

<div class="bubble">
	<Button
		icon="arrowL"
		data-rail-bubble
		aria-controls="reviewRail"
		aria-expanded="false"
		aria-label="Show the review sidebar"
		title="Show review sidebar"
		onclick={() => rail.show()}
	/>
</div>

<style>
	.bubble {
		position: fixed;
		top: 50%;
		right: var(--space-2);
		z-index: var(--layer-dropdown);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow);
		translate: 0 -50%;
	}
	/* stacked layout: the rail comes back under the evidence, so the bubble sits by the thumb */
	@media (max-width: 700px) {
		.bubble {
			top: auto;
			bottom: var(--space-4);
			translate: none;
		}
	}
</style>
