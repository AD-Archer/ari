import type { DockTileId } from './dockDefaults';
import { setTileSize } from './dockLayout';
import { resizeByKey, type DockResizeEdge } from './dockSizing';
import type { DockState } from './dockState.svelte';

const activationKeys = ['Enter', ' '];

// page-level shortcuts would otherwise also fire on these keys
export function keepKeysOnControl(event: KeyboardEvent) {
	if (event.key.startsWith('Arrow') || activationKeys.includes(event.key)) event.stopPropagation();
}

export function moveTileWithKey(dock: DockState, tile: DockTileId, event: KeyboardEvent) {
	keepKeysOnControl(event);
	if (!event.key.startsWith('Arrow')) return;
	event.preventDefault();
	const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
	if (event.altKey) {
		const anchor = dock.anchorOf(tile);
		const target = dock.visible[dock.visible.indexOf(anchor) + direction];
		if (target) dock.group(anchor, target);
		else dock.announcement = `${dock.panelName(anchor)} has no adjacent tile in that direction.`;
		return;
	}
	if (dock.move(tile, direction)) dock.focus.control(tile, 'move');
}

export function moveTabWithKey(
	dock: DockState,
	anchor: DockTileId,
	tile: DockTileId,
	event: KeyboardEvent
) {
	if (activationKeys.includes(event.key)) {
		event.stopPropagation();
		return;
	}
	const members = dock.members(anchor);
	if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'ArrowDown') return dock.detachTab(tile);
		const current = members.indexOf(tile);
		if (current >= 0) dock.reorderTab(tile, current + (event.key === 'ArrowLeft' ? -1 : 1));
		return;
	}
	if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
	event.preventDefault();
	event.stopPropagation();
	if (!members.length) return;
	const current = Math.max(0, members.indexOf(tile));
	const next =
		event.key === 'Home'
			? 0
			: event.key === 'End'
				? members.length - 1
				: (current + (event.key === 'ArrowLeft' ? -1 : 1) + members.length) % members.length;
	dock.selectTab(members[next], true);
}

export function resizeTileWithKey(
	dock: DockState,
	tile: DockTileId,
	edge: DockResizeEdge,
	event: KeyboardEvent
) {
	const opensMenu = activationKeys.includes(event.key);
	const next = resizeByKey(
		dock.sizeOf(tile),
		edge,
		event.key,
		event.shiftKey,
		dock.fitHeights[tile] ?? dock.measuredHeights[tile]
	);
	if (!opensMenu && !next) return;
	event.preventDefault();
	event.stopPropagation();
	if (opensMenu) {
		dock.setSizeMenu(tile, dock.sizeMenuTile !== dock.anchorOf(tile));
		return;
	}
	if (next) dock.layout = setTileSize(dock.layout, tile, next);
	dock.announceSize(tile);
	dock.focus.resizeHandle(tile, edge);
}

export interface DockShortcut {
	id: string;
	defaultBinding: string;
	label: string;
	handler: () => void;
}

// the ids and default bindings are the ones reviewers may already have customised
export function dockShortcuts(dock: DockState): DockShortcut[] {
	const step = (direction: -1 | 1) => {
		const order = dock.ordered;
		if (!order.length) return;
		const index = dock.current ? order.indexOf(dock.current) : -1;
		dock.showTile(order[(index + direction + order.length) % order.length]);
	};
	return [
		...Array.from({ length: 9 }, (unused, index) => ({
			id: `tab${index + 1}`,
			defaultBinding: String(index + 1),
			label: `Evidence section ${index + 1}`,
			handler: () => dock.showTile(dock.ordered[index])
		})),
		{
			id: 'tabPrev',
			defaultBinding: '[',
			label: 'Previous evidence section',
			handler: () => step(-1)
		},
		{ id: 'tabNext', defaultBinding: ']', label: 'Next evidence section', handler: () => step(1) }
	];
}
