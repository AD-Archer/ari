<script lang="ts">
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	// sits inside the element marked data-review-rail, which the drag measures

	const { rail } = useReview();
</script>

<button
	type="button"
	class={{ handle: true, hidePending: rail.hidePending, resizing: rail.resizing }}
	data-rail-handle
	aria-label="Resize the review sidebar. Left arrow widens, right arrow narrows, Home resets. Drag or arrow right past the minimum width to hide it."
	title="Drag to resize · drag right to hide"
	onpointerdown={rail.startResize}
	onkeydown={rail.resizeWithKey}
	onlostpointercapture={rail.lostCapture}
	onclick={(event) => event.preventDefault()}
></button>

<style>
	.handle {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -5px;
		z-index: var(--layer-sticky);
		width: 10px;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: ew-resize;
		touch-action: none;
	}
	.handle::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 4px;
		width: 2px;
		background: transparent;
		transition: background 0.15s ease;
	}
	.handle:hover::before,
	.handle:focus-visible::before,
	.handle.resizing::before {
		background: color-mix(in srgb, var(--color-blue) 65%, transparent);
	}
	.handle.hidePending::before {
		background: color-mix(in srgb, var(--color-red) 70%, transparent);
	}
	.handle:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--color-blue) 70%, transparent);
		outline-offset: -4px;
		border-radius: var(--radius-sm);
	}
	/* stacked layout: nothing to drag */
	@media (max-width: 700px) {
		.handle {
			display: none;
		}
	}
</style>
