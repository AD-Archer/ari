import { tick, untrack, type Snippet } from 'svelte';
import type { IconName } from '$lib/components/ui';
import { defaultDockLayout, type DockLayout, type DockTileId } from './dockDefaults';
import { DockFocus } from './dockFocus';
import { HoverGate } from './dockHover';
import {
	dockPlaceholder,
	packLayout,
	type DockEntry,
	type DockMetrics,
	type DockPacking,
	type DockRect
} from './dockGeometry';
import * as model from './dockLayout';
import type { DockAlignment, DockDropTarget } from './dockLayout';
import {
	dockStorageKey,
	loadDockLayout,
	serializeDockLayout,
	type DockScope
} from './dockMigrations';
import { DockResizeSession } from './dockResizeSession';
import { heightControlValue } from './dockSizing';
import { DockTabSession } from './dockTabSession';
import { DockTileSession } from './dockTileSession';

export interface DockTileInput {
	id: DockTileId;
	label: string;
	icon?: IconName;
	available: boolean;
	body: Snippet;
}

export interface DockOptions {
	tiles: () => DockTileInput[];
	scope: () => DockScope;
	// 'hover' is the pointer or focus entering a tile; 'select' is a deliberate choice of tile or tab
	onSelect?: (tile: DockTileId, reason: 'select' | 'hover') => void;
}

export class DockState {
	layout = $state.raw<DockLayout>(defaultDockLayout());
	loadedKey = $state<string | null>(null);
	current = $state<DockTileId | null>(null);
	announcement = $state('');
	workspace = $state<HTMLElement | null>(null);
	workspaceWidth = $state(0);
	stacked = $state(false);
	measuredHeights = $state.raw<Partial<Record<DockTileId, number>>>({});
	fitHeights = $state.raw<Partial<Record<DockTileId, number>>>({});
	sizeMenuTile = $state<DockTileId | null>(null);

	holdingTile = $state<DockTileId | null>(null);
	draggingTile = $state<DockTileId | null>(null);
	dropTarget = $state.raw<DockDropTarget | null>(null);
	groupTarget = $state<DockTileId | null>(null);
	groupCandidate = $state<DockTileId | null>(null);
	dragPosition = $state.raw({ left: 0, top: 0, width: 0 });
	dragGrabRatio = $state(0.5);
	// 64 stands in until the dragged tile has been measured
	placeholderHeight = $state(64);
	settling = $state(false);
	committingTile = $state<DockTileId | null>(null);

	resizingTile = $state<DockTileId | null>(null);

	tabPressed = $state(false);
	draggingTab = $state<DockTileId | null>(null);
	tabDropIndex = $state<number | null>(null);
	tabDetachReady = $state(false);
	tabDetachTarget = $state.raw<DockDropTarget | null>(null);
	tabDetachPreview = $state.raw<DockRect | null>(null);
	tabDragPosition = $state.raw({ left: 0, top: 0, width: 0, height: 0 });

	readonly focus = new DockFocus(this);
	readonly hoverGate = new HoverGate();
	readonly tileSession = new DockTileSession(this);
	readonly tabSession = new DockTabSession(this);
	readonly resizeSession = new DockResizeSession(this);

	readonly #options: DockOptions;
	#appliedRequest: string | null = null;

	readonly tiles = $derived.by(() => this.#options.tiles());
	readonly available = $derived(this.tiles.filter((tile) => tile.available).map((tile) => tile.id));
	readonly visible = $derived(model.visibleOrder(this.layout, this.available));
	readonly ordered = $derived(model.orderedAvailableTiles(this.layout, this.available));
	readonly storageKey = $derived.by(() => dockStorageKey(4, this.#options.scope()));
	readonly metrics = $derived<DockMetrics>({
		width: this.workspaceWidth,
		stacked: this.stacked,
		measuredHeights: this.measuredHeights,
		placeholderHeight: this.placeholderHeight
	});
	readonly layoutReady = $derived(
		this.workspaceWidth > 0 && this.visible.every((tile) => (this.measuredHeights[tile] ?? 0) > 0)
	);
	readonly packing = $derived.by<DockPacking>(() => {
		const entries: DockEntry[] = this.visible.filter((tile) => tile !== this.draggingTile);
		if (this.draggingTile && this.dropTarget) {
			entries.splice(
				Math.max(0, Math.min(this.dropTarget.index, entries.length)),
				0,
				dockPlaceholder
			);
		}
		// tiles that will give way slide aside live so the hole the placeholder marks opens up
		const adjustments = this.draggingTile
			? (this.dropTarget?.adjustments ?? null)
			: this.draggingTab && this.tabDetachReady
				? (this.tabDetachTarget?.adjustments ?? null)
				: null;
		return packLayout(
			this.layout,
			this.metrics,
			entries,
			this.draggingTile,
			this.dropTarget?.column ?? null,
			this.dropTarget?.columns ?? null,
			adjustments
		);
	});
	readonly interacting = $derived(
		this.holdingTile !== null ||
			this.draggingTile !== null ||
			this.resizingTile !== null ||
			this.tabPressed
	);

	constructor(options: DockOptions) {
		this.#options = options;

		$effect(() => {
			const key = this.storageKey;
			const scope = this.#options.scope();
			untrack(() => {
				this.cancelInteractions();
				this.sizeMenuTile = null;
				let layout = defaultDockLayout();
				try {
					layout = loadDockLayout((name) => localStorage.getItem(name), scope).layout;
				} catch {
					// a locked-down browser may deny storage access
				}
				this.layout = layout;
				this.loadedKey = key;
			});
		});

		$effect(() => {
			const key = this.storageKey;
			const serialized = serializeDockLayout(this.layout);
			// a resize writes once when it ends, not on every pointer move
			if (this.loadedKey !== key || this.resizingTile) return;
			try {
				localStorage.setItem(key, serialized);
			} catch {
				// the layout still works for this visit without persistence
			}
		});

		$effect(() => {
			if (!this.interacting) return;
			const onKey = (event: KeyboardEvent) => {
				if (event.key !== 'Escape') return;
				event.preventDefault();
				this.cancelInteractions(true);
			};
			window.addEventListener('keydown', onKey, true);
			return () => window.removeEventListener('keydown', onKey, true);
		});
	}

	tileInput = (tile: DockTileId) => this.tiles.find((candidate) => candidate.id === tile);
	label = (tile: DockTileId) => this.tileInput(tile)?.label ?? tile;
	// a label may carry a count after a middle dot; the name is the part before it
	name = (tile: DockTileId) => this.label(tile).replace(/ ·.*$/, '');
	sizeOf = (tile: DockTileId) => model.sizeOf(this.layout, tile);
	anchorOf = (tile: DockTileId) => model.layoutAnchor(this.layout, tile);
	groupMembers = (tile: DockTileId) => model.groupMembers(this.layout, tile);
	members = (tile: DockTileId) => model.availableGroupMembers(this.layout, this.available, tile);
	activeOf = (tile: DockTileId) => model.activeTile(this.layout, this.available, tile);
	isCollapsed = (tile: DockTileId) => this.layout.collapsed[tile] ?? false;
	widthPercent = (tile: DockTileId) => model.widthPercent(this.layout, tile);
	heightControlValue = (tile: DockTileId) =>
		heightControlValue(this.sizeOf(tile), this.fitHeights[tile] ?? this.measuredHeights[tile]);

	panelName(tile: DockTileId) {
		const members = this.members(tile);
		if (members.length <= 1) return this.name(members[0] ?? tile);
		return `${this.name(members[0])} group with ${members.length} tabs`;
	}

	sizeDescription(tile: DockTileId) {
		const size = this.sizeOf(tile);
		return `${this.widthPercent(tile)}% width, ${size.height === null ? 'fit-content height' : `${size.height} pixel height`}`;
	}

	announceSize(tile: DockTileId) {
		this.announcement = `${this.name(tile)} is ${this.sizeDescription(tile)}.`;
	}

	cancelInteractions(announce = false) {
		this.tileSession.cancel(announce);
		this.resizeSession.cancel(announce);
		this.tabSession.cancel(announce);
	}

	setSizeMenu(tile: DockTileId, open: boolean) {
		const anchor = this.anchorOf(tile);
		if (!open) {
			if (this.sizeMenuTile === anchor) this.sizeMenuTile = null;
			return;
		}
		this.cancelInteractions();
		if (!this.isCollapsed(anchor)) this.sizeMenuTile = anchor;
	}

	setColumns(tile: DockTileId, columns: number) {
		this.layout = model.setTileColumns(this.layout, tile, columns);
	}

	setHeight(tile: DockTileId, height: number | null, announce = false) {
		this.layout = model.setTileHeight(this.layout, tile, height);
		if (announce) this.announceSize(tile);
	}

	align(tile: DockTileId, alignment: DockAlignment) {
		this.layout = model.alignTile(this.layout, tile, alignment);
		const side = alignment === 'start' ? 'left' : alignment === 'end' ? 'right' : 'center';
		this.announcement = `${this.name(tile)} aligned ${side} at ${this.sizeDescription(tile)}.`;
	}

	resetSize(tile: DockTileId) {
		this.layout = model.resetTileSize(this.layout, tile);
		this.announcement = `${this.name(tile)} returned to its default size.`;
	}

	place(tile: DockTileId, index: number, announce = true) {
		const placed = model.placeTile(this.layout, this.available, tile, index);
		this.layout = placed.layout;
		if (announce) {
			this.announcement = `${this.panelName(placed.anchor)} moved to position ${placed.position} of ${placed.total}.`;
		}
	}

	move(tile: DockTileId, direction: -1 | 1, wrap = false) {
		const moved = model.moveTile(this.layout, this.available, tile, direction, wrap);
		if (!moved) return false;
		this.layout = moved.layout;
		this.announcement = `${this.panelName(moved.anchor)} moved to position ${moved.position} of ${moved.total}.`;
		return true;
	}

	moveNext(tile: DockTileId) {
		this.move(tile, 1, true);
		this.focus.control(tile, 'move');
	}

	commitDrop(tile: DockTileId, target: DockDropTarget) {
		const placed = model.commitDropTarget(this.layout, this.available, tile, target);
		this.layout = placed.layout;
		this.announcement = `${this.panelName(placed.anchor)} moved to position ${placed.position} of ${placed.total}.`;
	}

	#setCurrent(tile: DockTileId, reason: 'select' | 'hover' = 'select') {
		if (reason === 'select') this.hoverGate.hold();
		this.current = tile;
		this.#options.onSelect?.(tile, reason);
	}

	selectTab(tile: DockTileId, focus = false, expand = true) {
		const group = model.groupFor(this.layout, tile);
		const anchor = this.anchorOf(tile);
		const focusWouldBeHidden = this.focus.insidePanel(anchor, this.activeOf(anchor));
		this.layout = model.selectGroupTab(this.layout, tile);
		this.#setCurrent(tile);
		if (expand) this.expand(anchor);
		if (focus || focusWouldBeHidden) this.focus.tab(tile);
		else if (group) this.focus.revealTab(tile);
	}

	// the page's "go to evidence section" shortcuts land here
	showTile(tile: DockTileId | undefined) {
		if (!tile) return;
		const anchor = this.anchorOf(tile);
		this.selectTab(tile);
		void tick().then(() => this.focus.panel(anchor)?.scrollIntoView({ block: 'start' }));
	}

	// focus entering a tile always counts; the pointer only once it has really moved since the last selection
	hover(tile: DockTileId, focused = false) {
		if (!focused && !this.hoverGate.open) return;
		if (this.draggingTile || this.draggingTab || this.current === tile) return;
		this.#setCurrent(tile, 'hover');
	}

	// a deep-linked tile wins once, otherwise a group's saved selection wins
	syncCurrent(requested: { key: string; tile: DockTileId } | null) {
		const order = this.ordered;
		if (requested && order.includes(requested.tile) && this.#appliedRequest !== requested.key) {
			this.#appliedRequest = requested.key;
			this.selectTab(requested.tile);
			return;
		}
		if (!requested && this.#appliedRequest) this.#appliedRequest = null;
		const current = this.current;
		const next =
			!current || !order.includes(current) ? order[0] : this.activeOf(this.anchorOf(current));
		if (next && next !== current) this.selectTab(next, false, false);
	}

	reorderTab(tile: DockTileId, index: number) {
		const reordered = model.reorderGroupTab(this.layout, this.available, tile, index);
		if (!reordered) return false;
		this.layout = reordered.layout;
		this.announcement = `${this.name(tile)} moved to tab ${reordered.position} of ${reordered.total}.`;
		this.selectTab(tile, true, false);
		return true;
	}

	group(dragging: DockTileId, stationary: DockTileId) {
		const grouped = model.groupTiles(this.layout, this.available, dragging, stationary);
		if (!grouped) return;
		this.layout = grouped.layout;
		this.sizeMenuTile = null;
		this.#setCurrent(grouped.targetActive);
		this.announcement = `${this.name(grouped.sourceActive)} grouped with ${this.name(grouped.targetActive)}. ${grouped.tabCount} tabs now share the stationary tile.`;
		this.focus.tab(grouped.targetActive);
	}

	detachTab(tile: DockTileId, target: DockDropTarget | null = null) {
		const detached = model.detachGroupTab(this.layout, this.available, tile, target);
		if (!detached) return;
		const { previousAnchor, nextAnchor } = detached;
		this.layout = detached.layout;
		const measured = this.measuredHeights[previousAnchor];
		if (measured !== undefined) {
			this.measuredHeights = { ...this.measuredHeights, [nextAnchor]: measured, [tile]: measured };
		}
		const fit = this.fitHeights[previousAnchor];
		if (fit !== undefined) {
			this.fitHeights = { ...this.fitHeights, [nextAnchor]: fit, [tile]: fit };
		}
		this.sizeMenuTile = null;
		this.#setCurrent(tile);
		this.announcement = `${this.name(tile)} moved out of the group to tile position ${this.visible.indexOf(tile) + 1}.`;
		void tick().then(() => {
			this.focus.panel(tile)?.scrollIntoView({ block: 'nearest' });
			this.focus.control(tile, 'move');
		});
	}

	toggleCollapsed(tile: DockTileId) {
		const anchor = this.anchorOf(tile);
		const collapsed = !this.isCollapsed(anchor);
		if (collapsed && this.sizeMenuTile === anchor) this.sizeMenuTile = null;
		this.layout = model.setCollapsed(this.layout, anchor, collapsed);
		this.announcement = `${this.name(anchor)} ${collapsed ? 'collapsed' : 'expanded'}.`;
	}

	expand(tile: DockTileId) {
		const anchor = this.anchorOf(tile);
		if (!this.isCollapsed(anchor)) return;
		this.layout = model.setCollapsed(this.layout, anchor, false);
		this.announcement = `${this.name(anchor)} expanded for keyboard navigation.`;
	}

	tabInsertionEdge(anchor: DockTileId, member: DockTileId): 'before' | 'after' | null {
		const dragging = this.draggingTab;
		const dropIndex = this.tabDropIndex;
		if (!dragging || this.tabDetachReady || dropIndex === null) return null;
		if (!this.groupMembers(anchor).includes(dragging)) return null;
		const remaining = this.members(anchor).filter((candidate) => candidate !== dragging);
		if (dropIndex < remaining.length && remaining[dropIndex] === member) return 'before';
		if (dropIndex === remaining.length && remaining.at(-1) === member) return 'after';
		return null;
	}

	recordHeights(tile: DockTileId, height: number) {
		// half a pixel of change is measurement noise
		if (Math.abs((this.measuredHeights[tile] ?? 0) - height) >= 0.5) {
			this.measuredHeights = { ...this.measuredHeights, [tile]: height };
		}
		const fitHeight = Math.max(42, height); // 42 is the tile header height
		if (
			this.sizeOf(tile).height === null &&
			Math.abs((this.fitHeights[tile] ?? 0) - fitHeight) >= 0.5
		) {
			this.fitHeights = { ...this.fitHeights, [tile]: fitHeight };
		}
		if (this.draggingTile === tile) this.placeholderHeight = height;
	}
}
