import { tick } from 'svelte';
import type { DockTileId } from './dockDefaults';
import type { DockResizeEdge } from './dockSizing';
import type { DockState } from './dockState.svelte';

export type DockControl = 'move' | 'size' | 'collapse';

export class DockFocus {
	readonly #dock: DockState;

	constructor(dock: DockState) {
		this.#dock = dock;
	}

	#find<Target extends HTMLElement>(selector: string) {
		return this.#dock.workspace?.querySelector<Target>(selector) ?? null;
	}

	panel = (tile: DockTileId) => this.#find(`[data-dock-tile="${tile}"]`);
	slot = (tile: DockTileId) => this.#find(`[data-dock-slot="${tile}"]`);
	head = (tile: DockTileId) => this.#find(`[data-dock-slot="${tile}"] [data-dock-head]`);
	tabStrip = (anchor: DockTileId) => this.#find(`[data-dock-tabstrip="${anchor}"]`);
	tabButton = (tile: DockTileId) => this.#find(`[data-dock-tab="${tile}"]`);

	slots() {
		return [...(this.#dock.workspace?.querySelectorAll<HTMLElement>('[data-dock-slot]') ?? [])];
	}

	insidePanel(anchor: DockTileId, active: DockTileId) {
		if (typeof document === 'undefined') return false;
		const tabPanel = this.#find(`[data-dock-tile="${anchor}"] [data-dock-tabpanel="${active}"]`);
		return tabPanel?.contains(document.activeElement) ?? false;
	}

	control(tile: DockTileId, control: DockControl) {
		void tick().then(() =>
			this.#find(`[data-dock-tile="${tile}"] [data-dock-control="${control}"]`)?.focus()
		);
	}

	resizeHandle(tile: DockTileId, edge: DockResizeEdge) {
		void tick().then(() =>
			this.#find(`[data-dock-tile="${tile}"] [data-dock-resize="${edge}"]`)?.focus()
		);
	}

	scrollTabIntoView(tile: DockTileId) {
		const button = this.tabButton(tile);
		const strip = button?.closest<HTMLElement>('[data-dock-tabstrip]');
		if (!button || !strip) return;
		const buttonRect = button.getBoundingClientRect();
		const stripRect = strip.getBoundingClientRect();
		// 2 pixels of breathing room inside the strip
		if (buttonRect.left < stripRect.left + 2) {
			strip.scrollLeft -= stripRect.left + 2 - buttonRect.left;
		} else if (buttonRect.right > stripRect.right - 2) {
			strip.scrollLeft += buttonRect.right - (stripRect.right - 2);
		}
	}

	tab(tile: DockTileId) {
		void tick().then(() => {
			this.tabButton(tile)?.focus({ preventScroll: true });
			this.scrollTabIntoView(tile);
		});
	}

	revealTab(tile: DockTileId) {
		void tick().then(() => this.scrollTabIntoView(tile));
	}

	releaseCapture(host: HTMLElement | null, pointerId: number) {
		if (!host?.hasPointerCapture(pointerId)) return;
		try {
			host.releasePointerCapture(pointerId);
		} catch {
			// the browser may already have released capture while cancelling the gesture
		}
	}
}
