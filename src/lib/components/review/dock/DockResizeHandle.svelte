<script lang="ts">
	import type { DockTileId } from '$lib/review/dockDefaults';
	import { resizeTileWithKey } from '$lib/review/dockKeyboard';
	import type { DockResizeEdge } from '$lib/review/dockSizing';
	import type { DockState } from '$lib/review/dockState.svelte';

	interface Props {
		dock: DockState;
		tile: DockTileId;
		edge: DockResizeEdge;
	}
	let { dock, tile, edge }: Props = $props();

	const label = $derived(
		`Resize ${dock.panelName(tile)} from the bottom-${edge} corner. Current size: ${dock.sizeDescription(tile)}. Horizontal arrows move this corner; Up and Down change height; Home fits content.`
	);
</script>

<button
	type="button"
	class={['handle', edge, dock.resizingTile === tile && 'active']}
	data-dock-resize={edge}
	aria-label={label}
	title="Drag for width and height · arrows move this corner · Home fits content"
	onpointerdown={(event) => dock.resizeSession.start(tile, edge, event)}
	onkeydown={(event) => resizeTileWithKey(dock, tile, edge, event)}
	onlostpointercapture={dock.resizeSession.lostCapture}
	onclick={(event) => event.preventDefault()}
></button>

<style>
	.handle {
		position: absolute;
		bottom: 0;
		z-index: 5;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text-3);
		cursor: nwse-resize;
		touch-action: none;
		opacity: 0;
		transition:
			opacity 0.18s ease,
			color 0.18s ease;
	}
	.left {
		left: 0;
		cursor: nesw-resize;
	}
	.right {
		right: 0;
	}
	.handle::before,
	.handle::after {
		content: '';
		position: absolute;
		bottom: 6px;
		width: 8px;
		height: 8px;
		border-bottom: 1.5px solid currentColor;
	}
	.left::before,
	.left::after {
		left: 6px;
		border-left: 1.5px solid currentColor;
		border-radius: 0 0 0 3px;
	}
	.right::before,
	.right::after {
		right: 6px;
		border-right: 1.5px solid currentColor;
		border-radius: 0 0 3px;
	}
	.handle::after {
		bottom: 10px;
		width: 4px;
		height: 4px;
		opacity: 0.65;
	}
	.handle:hover,
	.handle.active,
	.handle:focus-visible {
		opacity: 1;
		color: var(--color-blue);
	}
	.handle:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--color-blue) 70%, transparent);
		outline-offset: -5px;
		border-radius: var(--radius-sm);
		box-shadow: none;
	}
	@media (any-pointer: coarse) {
		.handle {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.handle {
			transition: none;
		}
	}
</style>
