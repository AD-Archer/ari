import type { DockLayout, DockTileId } from './dockDefaults';
import {
	applyResize,
	resizeByPointer,
	sideNeighborRows,
	type DockResizeEdge,
	type ResizeStart
} from './dockSizing';
import type { DockState } from './dockState.svelte';

interface ResizePointer extends ResizeStart {
	id: number;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	origin: DockLayout;
	captureHost: HTMLElement;
	moved: boolean;
	widthChanged: boolean;
	heightChanged: boolean;
}

export class DockResizeSession {
	readonly #dock: DockState;
	#pointer: ResizePointer | null = null;

	constructor(dock: DockState) {
		this.#dock = dock;
	}

	#clear(pointer: ResizePointer) {
		this.#pointer = null;
		this.#dock.resizingTile = null;
		window.removeEventListener('pointermove', this.#onMove);
		window.removeEventListener('pointerup', this.#onUp);
		window.removeEventListener('pointercancel', this.#onCancel);
		document.body.classList.remove('dockResizing', 'dockResizingLeft', 'dockResizingRight');
		this.#dock.focus.releaseCapture(pointer.captureHost, pointer.id);
	}

	cancel(announce = false) {
		const dock = this.#dock;
		const pointer = this.#pointer;
		if (!pointer) return;
		dock.layout = { ...dock.layout, sizes: pointer.origin.sizes };
		this.#clear(pointer);
		if (announce && pointer.moved) {
			dock.announcement = `${dock.name(pointer.tile)} resize cancelled.`;
		}
	}

	lostCapture = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};

	start(tile: DockTileId, edge: DockResizeEdge, event: PointerEvent) {
		const dock = this.#dock;
		if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0 || dock.stacked) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		dock.cancelInteractions();
		dock.sizeMenuTile = null;
		const handle = event.currentTarget as HTMLElement;
		const panel = handle.closest<HTMLElement>('[data-dock-tile]');
		if (!panel) return;
		const panelRect = panel.getBoundingClientRect();
		const current = dock.sizeOf(tile);
		const pointer: ResizePointer = {
			id: event.pointerId,
			tile,
			edge,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			startWidth: panelRect.width,
			startHeight:
				current.height === null
					? (dock.fitHeights[tile] ?? dock.measuredHeights[tile] ?? panelRect.height)
					: panelRect.height,
			startColumn: current.column,
			startColumns: current.columns,
			startCustomHeight: current.height,
			sideNeighborRows: sideNeighborRows(dock.layout, dock.packing, dock.visible, tile, edge),
			origin: dock.layout,
			captureHost: handle,
			moved: false,
			widthChanged: false,
			heightChanged: false
		};
		try {
			handle.setPointerCapture(pointer.id);
		} catch {
			return;
		}
		this.#pointer = pointer;
		dock.resizingTile = tile;
		window.addEventListener('pointermove', this.#onMove, { passive: false });
		window.addEventListener('pointerup', this.#onUp);
		window.addEventListener('pointercancel', this.#onCancel);
		document.body.classList.add(
			'dockResizing',
			edge === 'left' ? 'dockResizingLeft' : 'dockResizingRight'
		);
		dock.announcement = `${dock.name(tile)} resize started. Drag sideways for width and vertically for height.`;
	}

	#update(pointer: ResizePointer) {
		const dock = this.#dock;
		const workspace = dock.workspace?.getBoundingClientRect();
		if (!workspace) return;
		const result = resizeByPointer(
			pointer,
			pointer.lastX - pointer.startX,
			pointer.lastY - pointer.startY,
			workspace.width,
			dock.stacked
		);
		pointer.widthChanged = result.widthChanged;
		pointer.heightChanged = result.heightChanged;
		dock.layout = applyResize(dock.layout, pointer.tile, result);
	}

	// 6 pixels of slop on either axis before the press counts as a resize
	#pastSlop = (pointer: ResizePointer) =>
		Math.abs(pointer.lastX - pointer.startX) > 6 || Math.abs(pointer.lastY - pointer.startY) > 6;

	#onMove = (event: PointerEvent) => {
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		if (!this.#pastSlop(pointer)) return;
		pointer.moved = true;
		event.preventDefault();
		this.#update(pointer);
	};

	#onUp = (event: PointerEvent) => {
		const dock = this.#dock;
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		if (this.#pastSlop(pointer)) {
			pointer.moved = true;
			this.#update(pointer);
		}
		this.#clear(pointer);
		if (!pointer.moved || (!pointer.widthChanged && !pointer.heightChanged)) {
			dock.announcement = `${dock.name(pointer.tile)} kept at ${dock.sizeDescription(pointer.tile)}.`;
			return;
		}
		dock.announceSize(pointer.tile);
	};

	#onCancel = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};
}
