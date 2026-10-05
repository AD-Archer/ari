<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import type { DockTileId } from '$lib/review/dockDefaults';
	import { measureWorkspace, styleVariables } from '$lib/review/dockDom';
	import { dockShortcuts } from '$lib/review/dockKeyboard';
	import type { DockScope } from '$lib/review/dockMigrations';
	import { DockState, type DockTileInput } from '$lib/review/dockState.svelte';
	import DockDragGhost from './DockDragGhost.svelte';
	import DockPlaceholder from './DockPlaceholder.svelte';
	import DockTile from './DockTile.svelte';

	interface Props {
		tiles: DockTileInput[];
		scope: DockScope;
		requestedTile?: { key: string; tile: DockTileId } | null;
		shortcutLabel?: (index: number) => string;
		onSelect?: (tile: DockTileId, reason: 'select' | 'hover') => void;
	}
	let { tiles, scope, requestedTile = null, shortcutLabel, onSelect }: Props = $props();

	const dock = new DockState({
		tiles: () => tiles,
		scope: () => scope,
		onSelect: (tile, reason) => onSelect?.(tile, reason)
	});

	export const shortcuts = dockShortcuts(dock);
	export const cancelInteractions = (announce = false) => dock.cancelInteractions(announce);
	export const showTile = (tile: DockTileId) => dock.showTile(tile);
	export const orderedTiles = () => dock.ordered;
	export const isCollapsed = (tile: DockTileId) => dock.isCollapsed(dock.anchorOf(tile));

	$effect(() => dock.syncCurrent(requestedTile));

	beforeNavigate(() => dock.cancelInteractions());

	onMount(() => {
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') dock.cancelInteractions(true);
		};
		const onBlur = () => dock.cancelInteractions(true);
		const onPointer = (event: PointerEvent) =>
			dock.hoverGate.pointerAt(event.clientX, event.clientY, event.type === 'pointerdown');
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('blur', onBlur);
		window.addEventListener('pointermove', onPointer, true);
		window.addEventListener('pointerdown', onPointer, true);
		return () => {
			window.removeEventListener('pointermove', onPointer, true);
			window.removeEventListener('pointerdown', onPointer, true);
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('blur', onBlur);
			dock.cancelInteractions();
			dock.tabSession.dispose();
		};
	});
</script>

{#if dock.available.length}
	<div
		class={{
			workspace: true,
			ready: dock.layoutReady,
			stacked: dock.stacked,
			resizing: dock.resizingTile !== null
		}}
		use:measureWorkspace={dock}
		use:styleVariables={{
			'workspace-height': dock.layoutReady ? `${dock.packing.height}px` : null
		}}
		onlostpointercapture={dock.tileSession.lostCapture}
	>
		<p class="live" aria-live="polite" aria-atomic="true">{dock.announcement}</p>
		{#each dock.visible as tile (tile)}
			{@const rect = dock.packing.tiles[tile]}
			{@const size = dock.sizeOf(tile)}
			<div
				class={{
					slot: true,
					dragSource: tile === dock.draggingTile,
					committing: tile === dock.committingTile
				}}
				data-dock-slot={tile}
				data-column={size.column}
				data-columns={size.columns}
				use:styleVariables={dock.layoutReady && rect
					? { 'tile-x': `${rect.x}px`, 'tile-y': `${rect.y}px`, 'tile-width': `${rect.width}px` }
					: {}}
			>
				<DockTile {dock} {tile} {shortcutLabel} />
			</div>
		{/each}
		{#if dock.draggingTab}
			<DockDragGhost {dock} tile={dock.draggingTab} />
		{/if}
		{#if dock.draggingTab && dock.tabDetachReady && dock.tabDetachPreview}
			<DockPlaceholder
				rect={{ ...dock.tabDetachPreview, height: dock.placeholderHeight }}
				variant="detach"
			/>
		{/if}
		{#if dock.draggingTile && dock.layoutReady && dock.packing.placeholder}
			<DockPlaceholder
				rect={dock.packing.placeholder}
				hidden={dock.groupTarget !== null}
				instant={dock.settling}
			/>
		{/if}
	</div>
{/if}

<style>
	.workspace {
		position: relative;
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		grid-auto-flow: row dense;
		align-items: start;
		gap: 20px;
		min-width: 0;
	}
	.workspace.ready {
		display: block;
		height: var(--workspace-height);
		transition: height 0.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.slot {
		min-width: 0;
		border-radius: var(--radius-lg);
		will-change: transform, width;
		transition:
			transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.42s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.workspace.resizing,
	.workspace.resizing .slot {
		transition: none;
	}
	/* before the tiles are measured (and on the server) the saved spans are placed by the css grid */
	.slot[data-column='0'] {
		grid-column-start: 1;
	}
	.slot[data-column='1'] {
		grid-column-start: 2;
	}
	.slot[data-column='2'] {
		grid-column-start: 3;
	}
	.slot[data-column='3'] {
		grid-column-start: 4;
	}
	.slot[data-column='4'] {
		grid-column-start: 5;
	}
	.slot[data-column='5'] {
		grid-column-start: 6;
	}
	.slot[data-column='6'] {
		grid-column-start: 7;
	}
	.slot[data-column='7'] {
		grid-column-start: 8;
	}
	.slot[data-column='8'] {
		grid-column-start: 9;
	}
	.slot[data-columns='4'] {
		grid-column-end: span 4;
	}
	.slot[data-columns='5'] {
		grid-column-end: span 5;
	}
	.slot[data-columns='6'] {
		grid-column-end: span 6;
	}
	.slot[data-columns='7'] {
		grid-column-end: span 7;
	}
	.slot[data-columns='8'] {
		grid-column-end: span 8;
	}
	.slot[data-columns='9'] {
		grid-column-end: span 9;
	}
	.slot[data-columns='10'] {
		grid-column-end: span 10;
	}
	.slot[data-columns='11'] {
		grid-column-end: span 11;
	}
	.slot[data-columns='12'] {
		grid-column-end: span 12;
	}
	.workspace.stacked:not(.ready) {
		grid-template-columns: minmax(0, 1fr);
	}
	.workspace.stacked:not(.ready) .slot {
		grid-column: 1 / -1;
	}
	.workspace.ready .slot {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--tile-width);
		transform: translate3d(var(--tile-x), var(--tile-y), 0);
	}
	.workspace .slot.dragSource {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 70;
		width: 0;
		height: 0;
		animation: none;
		transform: none;
		/* no transition: transform must reach none on the first drag frame, or the mid-transition matrix
		   keeps this slot a containing block and the fixed tile inside glides until the tween ends */
		transition: none;
		will-change: auto;
		pointer-events: none;
	}
	.workspace .slot.committing {
		transition: none;
	}
	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
	:global(body.dockDragging),
	:global(body.dockDragging *),
	:global(body.dockTabDragging),
	:global(body.dockTabDragging *) {
		cursor: grabbing !important;
		user-select: none !important;
	}
	:global(body.dockResizing),
	:global(body.dockResizing *) {
		user-select: none !important;
	}
	:global(body.dockResizingLeft),
	:global(body.dockResizingLeft *) {
		cursor: nesw-resize !important;
	}
	:global(body.dockResizingRight),
	:global(body.dockResizingRight *) {
		cursor: nwse-resize !important;
	}
	@media (max-width: 1100px) {
		.workspace:not(.ready) {
			grid-template-columns: minmax(0, 1fr);
		}
		.workspace:not(.ready) .slot {
			grid-column: 1 / -1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.workspace,
		.slot {
			transition: none;
		}
	}
</style>
