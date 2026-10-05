import { tick } from 'svelte';
import { isDockTileId, type DockTileId } from './dockDefaults';
import { autoScrollStep } from './dockAutoScroll';
import { inGroupZone, inStickyZone, pixelWidth } from './dockGeometry';
import { dropTargetAt } from './dockPlacement';
import type { DockState } from './dockState.svelte';

interface TilePointer {
	id: number;
	tile: DockTileId;
	startX: number;
	startY: number;
	pickupX: number;
	pickupY: number;
	lastX: number;
	lastY: number;
	captureHost: HTMLElement | null;
	panelRect: DOMRect;
	grabRatioX: number;
	grabY: number;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export class DockTileSession {
	readonly #dock: DockState;
	#pointer: TilePointer | null = null;
	#holdTimer: ReturnType<typeof setTimeout> | null = null;
	#groupHoverTimer: ReturnType<typeof setTimeout> | null = null;
	#settleTimer: ReturnType<typeof setTimeout> | null = null;
	#dragFrame: number | null = null;
	#autoScrollFrame: number | null = null;

	constructor(dock: DockState) {
		this.#dock = dock;
	}

	#removeListeners() {
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', this.#onMove);
		window.removeEventListener('pointerup', this.#onUp);
		window.removeEventListener('pointercancel', this.#onCancel);
		window.removeEventListener('touchmove', this.#onTouchMove);
	}

	#cancelFrames() {
		if (this.#dragFrame !== null) cancelAnimationFrame(this.#dragFrame);
		if (this.#autoScrollFrame !== null) cancelAnimationFrame(this.#autoScrollFrame);
		this.#dragFrame = null;
		this.#autoScrollFrame = null;
	}

	#clearGroupHover() {
		if (this.#groupHoverTimer) clearTimeout(this.#groupHoverTimer);
		this.#groupHoverTimer = null;
		this.#dock.groupCandidate = null;
		this.#dock.groupTarget = null;
	}

	cancel(announce = false) {
		const dock = this.#dock;
		if (this.#holdTimer) clearTimeout(this.#holdTimer);
		this.#holdTimer = null;
		this.#clearGroupHover();
		if (this.#settleTimer) clearTimeout(this.#settleTimer);
		this.#settleTimer = null;
		const pointer = this.#pointer;
		const movingTile = dock.draggingTile;
		this.#pointer = null;
		dock.holdingTile = null;
		dock.draggingTile = null;
		dock.dropTarget = null;
		dock.settling = false;
		dock.dragPosition = { left: 0, top: 0, width: 0 };
		dock.dragGrabRatio = 0.5;
		this.#cancelFrames();
		this.#removeListeners();
		if (typeof document !== 'undefined') document.body.classList.remove('dockDragging');
		if (pointer) dock.focus.releaseCapture(pointer.captureHost, pointer.id);
		if (announce && movingTile) dock.announcement = `${dock.name(movingTile)} move cancelled.`;
	}

	lostCapture = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};

	start(tile: DockTileId, event: PointerEvent) {
		const dock = this.#dock;
		if (
			!event.isPrimary ||
			event.button !== 0 ||
			(event.target as HTMLElement).closest('button, a, input, textarea, select')
		) {
			return;
		}
		dock.cancelInteractions();
		dock.sizeMenuTile = null;
		if (event.pointerType !== 'touch') event.preventDefault();
		const panel = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-dock-tile]');
		if (!panel) return;
		dock.holdingTile = tile;
		const panelRect = panel.getBoundingClientRect();
		const pointer: TilePointer = {
			id: event.pointerId,
			tile,
			startX: event.clientX,
			startY: event.clientY,
			pickupX: event.clientX,
			pickupY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			captureHost: null,
			panelRect,
			grabRatioX: Math.max(0, Math.min(1, (event.clientX - panelRect.left) / panelRect.width)),
			grabY: event.clientY - panelRect.top
		};
		this.#pointer = pointer;
		// seeded a full hold before the dragging class flips, so the pickup frame never paints stale coordinates
		dock.dragGrabRatio = pointer.grabRatioX;
		dock.dragPosition = {
			left: panelRect.left + pointer.grabRatioX * panelRect.width,
			top: panelRect.top,
			width: panelRect.width
		};
		window.addEventListener('pointermove', this.#onMove, { passive: false });
		window.addEventListener('pointerup', this.#onUp);
		window.addEventListener('pointercancel', this.#onCancel);
		if (event.pointerType === 'touch') {
			window.addEventListener('touchmove', this.#onTouchMove, { passive: false });
		}
		// 1000ms hold; the lift animation in DockTile runs for the same second
		this.#holdTimer = setTimeout(() => this.#pickUp(pointer), 1000);
	}

	#pickUp(pointer: TilePointer) {
		const dock = this.#dock;
		if (this.#pointer !== pointer) return;
		const tile = pointer.tile;
		this.#holdTimer = null;
		dock.holdingTile = null;
		dock.dropTarget = { index: dock.visible.indexOf(tile), column: dock.sizeOf(tile).column };
		pointer.pickupX = pointer.lastX;
		pointer.pickupY = pointer.lastY;
		// re-read the settled panel: anything that closed after pointerdown must not inflate the placeholder
		const settledPanel = dock.focus.panel(tile);
		if (settledPanel) {
			pointer.panelRect = settledPanel.getBoundingClientRect();
			pointer.grabRatioX = Math.max(
				0,
				Math.min(1, (pointer.lastX - pointer.panelRect.left) / pointer.panelRect.width)
			);
			pointer.grabY = pointer.lastY - pointer.panelRect.top;
		}
		dock.placeholderHeight =
			settledPanel?.offsetHeight ?? dock.measuredHeights[tile] ?? pointer.panelRect.height;
		dock.draggingTile = tile;
		dock.dragGrabRatio = pointer.grabRatioX;
		pointer.captureHost = dock.workspace;
		try {
			pointer.captureHost?.setPointerCapture(pointer.id);
		} catch {
			this.cancel();
			return;
		}
		document.body.classList.add('dockDragging');
		this.#updatePosition(pointer, false);
		dock.announcement = `${dock.name(tile)} picked up. Move the pointer and release to place it.`;
	}

	#groupTargetAt(x: number, y: number, dragging: DockTileId) {
		const dock = this.#dock;
		const sourceAnchor = dock.anchorOf(dragging);
		let best: { tile: DockTileId; area: number } | null = null;
		for (const slot of dock.focus.slots()) {
			const value = slot.dataset.dockSlot;
			if (!isDockTileId(value)) continue;
			const tile = dock.anchorOf(value);
			if (tile === sourceAnchor) continue;
			const rect = slot.getBoundingClientRect();
			const head = slot.querySelector<HTMLElement>('[data-dock-head]');
			if (!inGroupZone(rect, head?.getBoundingClientRect() ?? null, x, y)) continue;
			const area = rect.width * rect.height;
			if (!best || area < best.area) best = { tile, area };
		}
		if (best) return best.tile;
		// taking or losing a candidate repacks the layout under the pointer, so the current one is held while
		// the pointer stays near its tile instead of flicking on and off mid-dwell
		const sticky = dock.groupTarget ?? dock.groupCandidate;
		if (!sticky || sticky === sourceAnchor) return null;
		const stickyRect = dock.focus.slot(sticky)?.getBoundingClientRect();
		return stickyRect && inStickyZone(stickyRect, x, y) ? sticky : null;
	}

	#updateGroupCandidate(candidate: DockTileId | null, dragging: DockTileId) {
		const dock = this.#dock;
		if (candidate === dock.groupCandidate) return;
		const clearedConfirmedTarget = dock.groupTarget !== null;
		this.#clearGroupHover();
		if (clearedConfirmedTarget) {
			dock.announcement = 'Group target cleared. Release to place the tile.';
		}
		if (!candidate) return;
		dock.groupCandidate = candidate;
		// 280ms dwell over another tile before it becomes the group target
		this.#groupHoverTimer = setTimeout(() => {
			this.#groupHoverTimer = null;
			if (dock.draggingTile !== dragging || dock.groupCandidate !== candidate) return;
			dock.groupTarget = candidate;
			dock.announcement = `Release to group ${dock.panelName(dragging)} with ${dock.panelName(candidate)}.`;
		}, 280);
	}

	#updatePosition(pointer: TilePointer, retarget = true) {
		const dock = this.#dock;
		const workspace = dock.workspace?.getBoundingClientRect();
		if (!workspace) return;
		let groupCandidate = dock.groupCandidate;
		if (retarget) {
			groupCandidate = this.#groupTargetAt(pointer.lastX, pointer.lastY, pointer.tile);
			this.#updateGroupCandidate(groupCandidate, pointer.tile);
		}
		// the reorder placeholder is frozen while a central overlap is considered, or the candidate would
		// repack out from under the pointer before the dwell completes
		const target =
			retarget && !groupCandidate && !dock.groupTarget
				? dropTargetAt(
						dock.layout,
						dock.metrics,
						dock.visible,
						pointer.tile,
						{
							localX: pointer.lastX - workspace.left,
							localY: pointer.lastY - workspace.top,
							workspaceWidth: workspace.width,
							grabRatioX: pointer.grabRatioX,
							grabY: pointer.grabY
						},
						dock.dropTarget
					)
				: dock.dropTarget;
		if (target) dock.dropTarget = target;
		const width = pixelWidth(dock.sizeOf(pointer.tile).columns, workspace.width, dock.stacked);
		const rawLeft = pointer.lastX - pointer.grabRatioX * width;
		const rawTop = pointer.lastY - pointer.grabY;
		// kept 8 pixels inside the viewport with at least 48 pixels of the tile still on screen
		const boundedLeft = Math.max(8, Math.min(rawLeft, window.innerWidth - Math.min(width, 48)));
		dock.dragPosition = {
			// css shifts the tile back by grabRatio of its width, so the grabbed point stays under the pointer
			left: boundedLeft + pointer.grabRatioX * width,
			top: Math.max(8, Math.min(rawTop, window.innerHeight - 48)),
			width
		};
	}

	#startAutoScroll() {
		if (this.#autoScrollFrame !== null) return;
		const step = () => {
			this.#autoScrollFrame = null;
			const pointer = this.#pointer;
			if (!pointer || !this.#dock.draggingTile || this.#dock.settling) return;
			if (autoScrollStep(this.#dock.workspace, pointer.lastY)) this.#updatePosition(pointer);
			this.#autoScrollFrame = requestAnimationFrame(step);
		};
		this.#autoScrollFrame = requestAnimationFrame(step);
	}

	// more than a pixel of travel tells a drag from a tile released where it was picked up
	#movedAfterPickup = (pointer: TilePointer) =>
		Math.hypot(pointer.lastX - pointer.pickupX, pointer.lastY - pointer.pickupY) > 1;

	// touch-action is fixed at gesture start and preventDefault on pointermove cannot stop native panning,
	// so while a tile is picked up the page scroll is blocked here; otherwise the browser scrolls and
	// pointercancels the drag
	#onTouchMove = (event: TouchEvent) => {
		if (!this.#pointer || !this.#dock.draggingTile) return;
		if (event.cancelable) event.preventDefault();
	};

	#onMove = (event: PointerEvent) => {
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		if (!this.#dock.draggingTile) {
			// moving more than 8 pixels before the hold completes is a scroll or a text selection, not a drag
			if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 8) {
				this.cancel();
			}
			return;
		}
		event.preventDefault();
		if (!this.#movedAfterPickup(pointer)) return;
		if (this.#dragFrame === null) {
			this.#dragFrame = requestAnimationFrame(() => {
				this.#dragFrame = null;
				if (this.#pointer === pointer && this.#dock.draggingTile) this.#updatePosition(pointer);
			});
		}
		this.#startAutoScroll();
	};

	#onUp = (event: PointerEvent) => {
		const dock = this.#dock;
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		if (dock.draggingTile && !this.#movedAfterPickup(pointer)) return this.cancel();
		if (dock.draggingTile && (dock.groupTarget || dock.dropTarget))
			return void this.#settle(pointer);
		this.cancel();
	};

	#onCancel = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};

	// the tile glides to where it will land for 280ms, then the layout change is committed
	#glideThen(tile: DockTileId, committing: DockTileId, commit: () => void) {
		const dock = this.#dock;
		const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280;
		this.#settleTimer = setTimeout(() => {
			this.#settleTimer = null;
			if (dock.draggingTile !== tile) return;
			dock.committingTile = committing;
			commit();
			this.cancel();
			void tick().then(() =>
				requestAnimationFrame(() => {
					if (dock.committingTile === committing) dock.committingTile = null;
				})
			);
		}, duration);
	}

	async #settle(pointer: TilePointer) {
		const dock = this.#dock;
		this.#cancelFrames();
		let groupTarget = dock.groupTarget;
		if (!groupTarget) {
			this.#updatePosition(pointer);
			// releasing over another tile's grouping zone is explicit intent; the dwell only steadies the preview
			groupTarget = dock.groupCandidate;
			this.#clearGroupHover();
		}
		const tile = dock.draggingTile;
		const target = dock.dropTarget;
		if (!tile || (!target && !groupTarget)) return this.cancel(true);
		this.#removeListeners();
		this.#pointer = null;
		dock.focus.releaseCapture(pointer.captureHost, pointer.id);
		pointer.captureHost = null;
		dock.settling = true;
		await tick();
		if (groupTarget) {
			const targetRect = dock.focus.slot(groupTarget)?.getBoundingClientRect();
			if (!targetRect || dock.draggingTile !== tile) return this.cancel(true);
			await nextFrame();
			if (dock.draggingTile !== tile) return;
			dock.dragPosition = {
				left: targetRect.left + dock.dragGrabRatio * targetRect.width,
				top: targetRect.top,
				width: targetRect.width
			};
			dock.announcement = `${dock.panelName(tile)} joining ${dock.panelName(groupTarget)}.`;
			const joined = groupTarget;
			this.#glideThen(tile, joined, () => dock.group(tile, joined));
			return;
		}
		if (!target) return this.cancel(true);
		const placeholder = dock.packing.placeholder;
		const workspace = dock.workspace?.getBoundingClientRect();
		if (!placeholder || !workspace || dock.draggingTile !== tile) {
			dock.commitDrop(tile, target);
			this.cancel();
			return;
		}
		await nextFrame();
		if (dock.draggingTile !== tile) return;
		dock.dragPosition = {
			left: workspace.left + placeholder.x + dock.dragGrabRatio * placeholder.width,
			top: workspace.top + placeholder.y,
			width: placeholder.width
		};
		dock.announcement = `${dock.name(tile)} snapping into place.`;
		this.#glideThen(tile, tile, () => dock.commitDrop(tile, target));
	}
}
