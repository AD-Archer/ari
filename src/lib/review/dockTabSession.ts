import type { DockTileId } from './dockDefaults';
import { detachedTabPreview, detachedTabTargetAt, nearWorkspace } from './dockPlacement';
import type { DockState } from './dockState.svelte';

interface TabPointer {
	id: number;
	anchor: DockTileId;
	tile: DockTileId;
	active: DockTileId;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	grabX: number;
	grabY: number;
	width: number;
	height: number;
	captureHost: HTMLElement;
	moved: boolean;
	ready: boolean;
	pointerType: string;
	touchScrolling: boolean;
}

export class DockTabSession {
	readonly #dock: DockState;
	#pointer: TabPointer | null = null;
	#holdTimer: ReturnType<typeof setTimeout> | null = null;
	#autoScrollFrame: number | null = null;
	#autoScrollDirection = 0;
	#suppressedClick: DockTileId | null = null;
	#suppressTimer: ReturnType<typeof setTimeout> | null = null;

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

	#stopAutoScroll() {
		this.#autoScrollDirection = 0;
		if (this.#autoScrollFrame !== null) cancelAnimationFrame(this.#autoScrollFrame);
		this.#autoScrollFrame = null;
	}

	#autoScroll(direction: -1 | 0 | 1) {
		this.#autoScrollDirection = direction;
		if (!direction) return this.#stopAutoScroll();
		if (this.#autoScrollFrame !== null) return;
		this.#autoScrollFrame = requestAnimationFrame(() => {
			this.#autoScrollFrame = null;
			const pointer = this.#pointer;
			if (!pointer || !pointer.moved || this.#dock.tabDetachReady || !this.#autoScrollDirection) {
				return;
			}
			const strip = this.#dock.focus.tabStrip(pointer.anchor);
			if (!strip) return;
			const before = strip.scrollLeft;
			// 10 pixels a frame
			strip.scrollLeft += this.#autoScrollDirection * 10;
			// under half a pixel of movement means the strip reached its end
			if (Math.abs(strip.scrollLeft - before) < 0.5) {
				this.#autoScrollDirection = 0;
				return;
			}
			this.#update(pointer);
		});
	}

	#clear(pointer: TabPointer) {
		const dock = this.#dock;
		if (this.#holdTimer) clearTimeout(this.#holdTimer);
		this.#holdTimer = null;
		this.#stopAutoScroll();
		this.#pointer = null;
		dock.tabPressed = false;
		dock.draggingTab = null;
		dock.tabDropIndex = null;
		dock.tabDetachReady = false;
		dock.tabDetachTarget = null;
		dock.tabDetachPreview = null;
		dock.tabDragPosition = { left: 0, top: 0, width: 0, height: 0 };
		this.#removeListeners();
		document.body.classList.remove('dockTabDragging');
		dock.focus.releaseCapture(pointer.captureHost, pointer.id);
	}

	cancel(announce = false) {
		const dock = this.#dock;
		const pointer = this.#pointer;
		if (!pointer) return;
		const selected = dock.activeOf(pointer.anchor);
		// a cancelled drag still ends in a click on the tab; swallow it for a second
		if (pointer.moved) this.#suppressClick(pointer.tile, 1000);
		this.#clear(pointer);
		if (announce && pointer.moved) {
			dock.announcement = `${dock.name(pointer.tile)} tab move cancelled.`;
			if (document.hasFocus()) dock.focus.tab(selected);
		}
	}

	dispose() {
		if (this.#suppressTimer) clearTimeout(this.#suppressTimer);
	}

	#suppressClick(tile: DockTileId, duration = 0) {
		if (this.#suppressTimer) clearTimeout(this.#suppressTimer);
		this.#suppressedClick = tile;
		this.#suppressTimer = setTimeout(() => {
			this.#suppressTimer = null;
			if (this.#suppressedClick === tile) this.#suppressedClick = null;
		}, duration);
	}

	click(tile: DockTileId) {
		if (this.#suppressedClick === tile) {
			this.#suppressedClick = null;
			return;
		}
		this.#dock.selectTab(tile);
	}

	lostCapture = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};

	start(anchor: DockTileId, tile: DockTileId, event: PointerEvent) {
		const dock = this.#dock;
		event.stopPropagation();
		if (!event.isPrimary || event.button !== 0 || dock.members(anchor).length < 2) return;
		dock.cancelInteractions();
		dock.sizeMenuTile = null;
		const button = event.currentTarget as HTMLElement;
		const rect = button.getBoundingClientRect();
		const panel = button.closest<HTMLElement>('[data-dock-tile]');
		if (panel) {
			// 42 is the tile header height
			dock.placeholderHeight =
				dock.sizeOf(anchor).height === null
					? Math.max(42, dock.fitHeights[anchor] ?? panel.offsetHeight)
					: panel.offsetHeight;
		}
		const pointer: TabPointer = {
			id: event.pointerId,
			anchor,
			tile,
			active: dock.activeOf(anchor),
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			grabX: event.clientX - rect.left,
			grabY: event.clientY - rect.top,
			width: rect.width,
			height: rect.height,
			captureHost: button,
			moved: false,
			ready: event.pointerType !== 'touch',
			pointerType: event.pointerType,
			touchScrolling: false
		};
		this.#pointer = pointer;
		dock.tabPressed = true;
		dock.tabDropIndex = dock.members(anchor).indexOf(tile);
		try {
			button.setPointerCapture(pointer.id);
		} catch {
			this.#clear(pointer);
			return;
		}
		window.addEventListener('pointermove', this.#onMove, { passive: false });
		window.addEventListener('pointerup', this.#onUp);
		window.addEventListener('pointercancel', this.#onCancel);
		if (event.pointerType === 'touch') {
			window.addEventListener('touchmove', this.#onTouchMove, { passive: false });
		}
		if (!pointer.ready) {
			// touch needs a 450ms long-press so a swipe can still scroll the strip or the page
			this.#holdTimer = setTimeout(() => {
				this.#holdTimer = null;
				if (this.#pointer !== pointer || pointer.moved) return;
				pointer.ready = true;
				dock.announcement = `${dock.name(tile)} tab ready to move.`;
			}, 450);
		}
	}

	#update(pointer: TabPointer) {
		const dock = this.#dock;
		dock.tabDragPosition = {
			left: pointer.lastX - pointer.grabX,
			top: pointer.lastY - pointer.grabY,
			width: pointer.width,
			height: pointer.height
		};
		const strip = dock.focus.tabStrip(pointer.anchor);
		const workspace = dock.workspace;
		if (!strip || !workspace) return this.#stopAutoScroll();
		const box = workspace.getBoundingClientRect();
		if (!nearWorkspace(box, pointer.lastX, pointer.lastY)) {
			const hadTarget = dock.tabDetachReady || dock.tabDropIndex !== null;
			this.#stopAutoScroll();
			dock.tabDetachReady = false;
			dock.tabDetachTarget = null;
			dock.tabDetachPreview = null;
			dock.tabDropIndex = null;
			if (hadTarget) dock.announcement = 'Return to the evidence area to place this tab.';
			return;
		}

		const stripRect = strip.getBoundingClientRect();
		// leaving the strip takes 28 pixels; coming back only 12, so the state does not flicker at the edge
		const margin = dock.tabDetachReady ? 12 : 28;
		const outsideStrip =
			pointer.lastX < stripRect.left - margin ||
			pointer.lastX > stripRect.right + margin ||
			pointer.lastY < stripRect.top - margin ||
			pointer.lastY > stripRect.bottom + margin;
		if (outsideStrip) {
			this.#stopAutoScroll();
			if (!dock.tabDetachReady) {
				dock.announcement = `Release to move ${dock.name(pointer.tile)} out of this group.`;
			}
			dock.tabDetachReady = true;
			dock.tabDetachTarget = detachedTabTargetAt(
				dock.layout,
				dock.metrics,
				dock.visible,
				pointer.tile,
				box,
				pointer.lastX,
				pointer.lastY,
				dock.tabDetachTarget
			);
			dock.tabDetachPreview = dock.tabDetachTarget
				? detachedTabPreview(
						dock.layout,
						dock.metrics,
						dock.visible,
						pointer.tile,
						dock.tabDetachTarget
					)
				: null;
			dock.tabDropIndex = null;
			return;
		}

		const wasDetaching = dock.tabDetachReady;
		dock.tabDetachReady = false;
		dock.tabDetachTarget = null;
		dock.tabDetachPreview = null;
		// the strip scrolls while the pointer is within 38 pixels of either end
		this.#autoScroll(
			strip.scrollWidth <= strip.clientWidth
				? 0
				: pointer.lastX < stripRect.left + 38
					? -1
					: pointer.lastX > stripRect.right - 38
						? 1
						: 0
		);
		let nextIndex = 0;
		for (const tabElement of strip.querySelectorAll<HTMLElement>('[data-dock-tab]')) {
			if (tabElement.dataset.dockTab === pointer.tile) continue;
			if (pointer.lastX > tabElement.getBoundingClientRect().left + tabElement.offsetWidth / 2) {
				nextIndex += 1;
			}
		}
		if (wasDetaching || dock.tabDropIndex !== nextIndex) {
			dock.announcement = `Release to move ${dock.name(pointer.tile)} to tab ${nextIndex + 1}.`;
		}
		dock.tabDropIndex = nextIndex;
	}

	// touch-action is fixed at gesture start and preventDefault on pointermove cannot stop native panning,
	// so once the tab is armed (or the strip is being swiped) the page scroll is blocked here
	#onTouchMove = (event: TouchEvent) => {
		const pointer = this.#pointer;
		if (!pointer || (!pointer.ready && !pointer.touchScrolling)) return;
		if (event.cancelable) event.preventDefault();
	};

	#beginMove(pointer: TabPointer) {
		pointer.moved = true;
		this.#dock.draggingTab = pointer.tile;
		document.body.classList.add('dockTabDragging');
	}

	#onMove = (event: PointerEvent) => {
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		const deltaX = event.clientX - pointer.lastX;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		const totalX = pointer.lastX - pointer.startX;
		const totalY = pointer.lastY - pointer.startY;
		const distance = Math.hypot(totalX, totalY);
		if (!pointer.ready) {
			const strip = this.#dock.focus.tabStrip(pointer.anchor);
			if (pointer.touchScrolling) {
				event.preventDefault();
				if (strip) strip.scrollLeft -= deltaX;
				return;
			}
			// more than 8 pixels before the long-press completes: sideways swipes scroll the strip, anything else
			// hands the gesture back to the page
			if (distance > 8) {
				if (pointer.pointerType === 'touch' && Math.abs(totalX) > Math.abs(totalY)) {
					if (this.#holdTimer) clearTimeout(this.#holdTimer);
					this.#holdTimer = null;
					pointer.touchScrolling = true;
					event.preventDefault();
					if (strip) strip.scrollLeft -= deltaX;
				} else {
					this.cancel();
				}
			}
			return;
		}
		// a press only becomes a drag after 7 pixels of travel
		if (!pointer.moved && distance < 7) return;
		event.preventDefault();
		if (!pointer.moved) this.#beginMove(pointer);
		this.#update(pointer);
	};

	#onUp = (event: PointerEvent) => {
		const dock = this.#dock;
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		pointer.lastX = event.clientX;
		pointer.lastY = event.clientY;
		const distance = Math.hypot(pointer.lastX - pointer.startX, pointer.lastY - pointer.startY);
		if (!pointer.moved && pointer.ready && distance >= 7) this.#beginMove(pointer);
		if (!pointer.moved) {
			if (pointer.touchScrolling) this.#suppressClick(pointer.tile);
			this.#clear(pointer);
			return;
		}
		event.preventDefault();
		this.#update(pointer);
		const tile = pointer.tile;
		const dropIndex = dock.tabDropIndex;
		const detachTarget = dock.tabDetachReady ? dock.tabDetachTarget : null;
		this.#suppressClick(tile);
		this.#clear(pointer);
		if (detachTarget) return dock.detachTab(tile, detachTarget);
		if (dropIndex !== null) {
			if (!dock.reorderTab(tile, dropIndex)) {
				dock.selectTab(tile, true, false);
				dock.announcement = `${dock.name(tile)} stayed in the same tab position.`;
			}
			return;
		}
		dock.announcement = `${dock.name(tile)} tab move cancelled.`;
		dock.focus.tab(pointer.active);
	};

	#onCancel = (event: PointerEvent) => {
		if (event.pointerId === this.#pointer?.id) this.cancel(true);
	};
}
