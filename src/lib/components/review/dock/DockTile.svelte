<script lang="ts">
	import type { DockTileId } from '$lib/review/dockDefaults';
	import { measureTile, styleVariables } from '$lib/review/dockDom';
	import type { DockState } from '$lib/review/dockState.svelte';
	import DockResizeHandle from './DockResizeHandle.svelte';
	import DockTileHead from './DockTileHead.svelte';

	interface Props {
		dock: DockState;
		tile: DockTileId;
		shortcutLabel?: (index: number) => string;
	}
	let { dock, tile, shortcutLabel }: Props = $props();

	const members = $derived(dock.members(tile));
	const active = $derived(dock.activeOf(tile));
	const showTablist = $derived(members.length > 1);
	const collapsed = $derived(dock.isCollapsed(tile));
	const size = $derived(dock.sizeOf(tile));
	const floating = $derived(dock.draggingTile === tile);
	const menuOpen = $derived(dock.sizeMenuTile === tile);
	const customHeight = $derived(size.height !== null && !collapsed);
	const scrollable = $derived(customHeight && !menuOpen);
	// a fixed-height tile is a named region that can be scrolled with the keyboard
	const scrollRegion = $derived(
		showTablist
			? {}
			: {
					role: 'region',
					'aria-label': `${dock.name(active)} content`,
					...(scrollable ? { tabindex: 0 } : {})
				}
	);
</script>

<section
	class={{
		tile: true,
		floating,
		settling: floating && dock.settling,
		holding: dock.holdingTile === tile,
		resizing: dock.resizingTile === tile,
		stacked: dock.stacked,
		customHeight,
		groupCandidate: dock.groupCandidate === tile && dock.groupTarget !== tile,
		groupTarget: dock.groupTarget === tile
	}}
	id="evidence-{tile}"
	data-dock-tile={tile}
	data-evidence-active={active}
	aria-labelledby={showTablist ? undefined : `evidence-${tile}-heading`}
	aria-label={showTablist ? `Evidence group with ${members.map(dock.name).join(', ')}` : undefined}
	use:measureTile={{ dock, tile }}
	use:styleVariables={{
		'tile-height': `${size.height ?? 0}px`,
		'drag-left': `${dock.dragPosition.left}px`,
		'drag-top': `${dock.dragPosition.top}px`,
		'drag-width': `${dock.dragPosition.width}px`,
		'drag-grab-ratio': dock.dragGrabRatio
	}}
	onpointerenter={() => dock.hover(active)}
	onpointermove={() => dock.hover(active)}
	onfocusin={() => dock.hover(active, true)}
>
	<DockTileHead {dock} {tile} {members} {active} {collapsed} {shortcutLabel} />
	<div class={{ body: true, collapsed }} aria-hidden={collapsed} inert={collapsed}>
		<div
			class="bodyInner"
			data-evidence-scroll-region={scrollable ? 'true' : undefined}
			{...scrollRegion}
		>
			{#if showTablist}
				{#each members as member (member)}
					<div
						id="evidence-{tile}-panel-{member}"
						class="tabPanel"
						role="tabpanel"
						data-dock-tabpanel={member}
						aria-labelledby="evidence-{tile}-tab-{member}"
						hidden={active !== member}
						inert={active !== member}
						tabindex={active === member && scrollable ? 0 : undefined}
					>
						{@render dock.tileInput(member)?.body()}
					</div>
				{/each}
			{:else}
				{@render dock.tileInput(active)?.body()}
			{/if}
		</div>
	</div>
	{#if !dock.stacked && !floating && !collapsed}
		<DockResizeHandle {dock} {tile} edge="left" />
		<DockResizeHandle {dock} {tile} edge="right" />
	{/if}
</section>

<style>
	.tile {
		position: relative;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		scroll-margin-top: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
		container-name: evidenceTile;
		container-type: inline-size;
		transition:
			transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.25s ease;
		transform-origin: 50% 20px;
		will-change: transform, box-shadow;
	}
	.tile.customHeight {
		display: flex;
		flex-direction: column;
		height: clamp(220px, var(--tile-height), 900px);
	}
	.tile.groupCandidate {
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-blue) 24%, transparent);
	}
	.tile.groupTarget {
		z-index: 2;
		transform: translateY(-3px) scale(1.008);
		box-shadow:
			0 0 0 3px color-mix(in srgb, var(--color-blue) 24%, transparent),
			0 16px 34px color-mix(in srgb, var(--color-blue) 14%, transparent);
	}
	.tile.holding {
		z-index: 3;
		/* both run for the 1s hold: the lift owns transform, the shake owns rotate and ends on the drag
		   wobble's starting angle so the handoff into dragging is seamless */
		animation:
			lift 1s ease-in-out forwards,
			loosen 1s ease-in-out forwards;
	}
	.tile.resizing {
		z-index: 4;
		transform: translateY(-2px) scale(1.002);
		box-shadow: var(--shadow-lg);
	}
	@keyframes lift {
		0% {
			transform: translateY(0) scale(1);
		}
		60% {
			transform: translateY(-1px) scale(1.002);
			box-shadow: var(--shadow);
		}
		100% {
			transform: translateY(-5px) scale(1.01);
			box-shadow: var(--shadow-lg);
		}
	}
	@keyframes loosen {
		0% {
			rotate: 0deg;
		}
		18% {
			rotate: -0.05deg;
		}
		34% {
			rotate: 0.07deg;
		}
		48% {
			rotate: -0.11deg;
		}
		60% {
			rotate: 0.15deg;
		}
		70% {
			rotate: -0.2deg;
		}
		79% {
			rotate: 0.26deg;
		}
		87% {
			rotate: -0.32deg;
		}
		94% {
			rotate: 0.38deg;
		}
		100% {
			rotate: -0.3deg;
		}
	}
	@keyframes wobble {
		0%,
		100% {
			rotate: -0.3deg;
		}
		50% {
			rotate: 0.35deg;
		}
	}
	.tile.floating {
		position: fixed;
		left: var(--drag-left);
		top: var(--drag-top);
		z-index: 80;
		width: var(--drag-width);
		max-width: calc(100vw - 16px);
		transform: translateX(calc(var(--drag-grab-ratio) * -100%)) translateY(-3px) scale(1.008);
		box-shadow: var(--shadow-lg);
		opacity: 0.94;
		pointer-events: none;
		animation: wobble 0.45s ease-in-out infinite;
		/* width must not transition here: the pickup frame can recalc once before the drag variables land,
		   and a tween from that start makes the tile visibly grow into place */
		transition:
			box-shadow 0.4s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.2s ease;
	}
	.tile.floating.settling {
		transform: translateX(calc(var(--drag-grab-ratio) * -100%)) translateY(0) rotate(0deg) scale(1);
		animation: none;
		rotate: 0deg;
		opacity: 1;
		/* 0.28s is the 280ms glide dockTileSession waits for before committing the drop */
		transition:
			left 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			top 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			box-shadow 0.28s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.16s ease;
		box-shadow: var(--shadow);
	}
	.body {
		display: grid;
		grid-template-rows: 1fr;
		min-height: 0;
		transition: grid-template-rows 0.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.customHeight .body {
		flex: 1 1 auto;
		grid-template-rows: minmax(0, 1fr);
	}
	.body.collapsed {
		grid-template-rows: 0fr;
	}
	.bodyInner {
		min-height: 0;
		overflow: hidden;
	}
	.tabPanel {
		min-width: 0;
		min-height: 0;
	}
	.customHeight .body:not(.collapsed) .bodyInner {
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
	}
	.stacked.customHeight .body:not(.collapsed) .bodyInner {
		overscroll-behavior-y: auto;
	}
	@media (prefers-reduced-motion: reduce) {
		.tile,
		.body {
			animation-duration: 0.01ms;
			animation-iteration-count: 1;
			transition: none;
		}
		.tile.floating {
			transform: translateX(calc(var(--drag-grab-ratio) * -100%));
		}
	}
</style>
