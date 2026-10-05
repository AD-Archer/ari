import {
	defaultTileSize,
	normalizeTileSize,
	type DockGroup,
	type DockLayout,
	type DockTileId,
	type DockTileSize
} from './dockDefaults';

export interface DockSpanOverride {
	tile: DockTileId;
	column: number;
	columns: number;
}

export interface DockDropTarget {
	index: number;
	column: number;
	columns?: number;
	adjustments?: DockSpanOverride[];
}

export type DockAlignment = 'start' | 'center' | 'end';

export const sizeOf = (layout: DockLayout, tile: DockTileId): DockTileSize =>
	normalizeTileSize(tile, layout.sizes[tile]);

export const groupFor = (layout: DockLayout, tile: DockTileId): DockGroup | null =>
	layout.groups.find((group) => group.tiles.includes(tile)) ?? null;

export const groupMembers = (layout: DockLayout, tile: DockTileId): DockTileId[] =>
	groupFor(layout, tile)?.tiles ?? [tile];

export const layoutAnchor = (layout: DockLayout, tile: DockTileId): DockTileId =>
	groupFor(layout, tile)?.anchor ?? tile;

export const availableGroupMembers = (
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId
): DockTileId[] => groupMembers(layout, tile).filter((member) => available.includes(member));

export function activeTile(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId
): DockTileId {
	const group = groupFor(layout, tile);
	const members = availableGroupMembers(layout, available, tile);
	if (!group) return members[0] ?? tile;
	return members.includes(group.active) ? group.active : (members[0] ?? group.tiles[0]);
}

export function anchorsFromOrder(layout: DockLayout, order: readonly DockTileId[]): DockTileId[] {
	const anchors: DockTileId[] = [];
	for (const tile of order) {
		const anchor = layoutAnchor(layout, tile);
		if (!anchors.includes(anchor)) anchors.push(anchor);
	}
	return anchors;
}

// a tile that is not available stays in the saved order and groups; it is only left out of what is drawn
export const visibleOrder = (layout: DockLayout, available: readonly DockTileId[]): DockTileId[] =>
	anchorsFromOrder(layout, layout.order).filter(
		(tile) => availableGroupMembers(layout, available, tile).length > 0
	);

export const orderedAvailableTiles = (
	layout: DockLayout,
	available: readonly DockTileId[]
): DockTileId[] => layout.order.filter((tile) => available.includes(tile));

export function setTileSize(layout: DockLayout, tile: DockTileId, size: unknown): DockLayout {
	return { ...layout, sizes: { ...layout.sizes, [tile]: normalizeTileSize(tile, size) } };
}

export const setTileColumns = (layout: DockLayout, tile: DockTileId, columns: number) =>
	setTileSize(layout, tile, { ...sizeOf(layout, tile), columns });

export const setTileColumn = (layout: DockLayout, tile: DockTileId, column: number) =>
	setTileSize(layout, tile, { ...sizeOf(layout, tile), column });

export const setTileHeight = (layout: DockLayout, tile: DockTileId, height: number | null) =>
	setTileSize(layout, tile, { ...sizeOf(layout, tile), height });

export function alignmentColumn(layout: DockLayout, tile: DockTileId, alignment: DockAlignment) {
	const columns = sizeOf(layout, tile).columns;
	if (alignment === 'start') return 0;
	if (alignment === 'end') return 12 - columns;
	return Math.round((12 - columns) / 2);
}

export function placementOptions(
	layout: DockLayout,
	tile: DockTileId
): { alignment: DockAlignment; label: string }[] {
	const lastColumn = 12 - sizeOf(layout, tile).columns;
	if (lastColumn === 0) return [];
	const centerColumn = alignmentColumn(layout, tile, 'center');
	return [
		{ alignment: 'start', label: 'Left' },
		...(centerColumn > 0 && centerColumn < lastColumn
			? [{ alignment: 'center' as const, label: 'Center' }]
			: []),
		{ alignment: 'end', label: 'Right' }
	];
}

export const alignTile = (layout: DockLayout, tile: DockTileId, alignment: DockAlignment) =>
	setTileColumn(layout, tile, alignmentColumn(layout, tile, alignment));

export function resetTileSize(layout: DockLayout, tile: DockTileId): DockLayout {
	const current = sizeOf(layout, tile);
	const defaults = defaultTileSize(tile);
	return setTileSize(layout, tile, {
		...defaults,
		column: Math.min(current.column, 12 - defaults.columns)
	});
}

export const widthPercent = (layout: DockLayout, tile: DockTileId) =>
	Math.round((sizeOf(layout, tile).columns / 12) * 100);

export interface PlacedTile {
	layout: DockLayout;
	anchor: DockTileId;
	position: number;
	total: number;
}

export function placeTile(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId,
	index: number
): PlacedTile {
	const anchor = layoutAnchor(layout, tile);
	const movingMembers = groupMembers(layout, anchor);
	const source = layout.order.filter((candidate) => !movingMembers.includes(candidate));
	// placement indexes describe what is on screen, so unavailable tiles go after the visible run
	const anchors = anchorsFromOrder(layout, source);
	const isVisible = (candidate: DockTileId) =>
		availableGroupMembers(layout, available, candidate).length > 0;
	const visible = anchors.filter(isVisible);
	const hidden = anchors.filter((candidate) => !isVisible(candidate));
	const boundedIndex = Math.max(0, Math.min(index, visible.length));
	visible.splice(boundedIndex, 0, anchor);
	return {
		layout: {
			...layout,
			order: [...visible, ...hidden].flatMap((entry) => groupMembers(layout, entry))
		},
		anchor,
		position: boundedIndex + 1,
		total: visible.length
	};
}

export function moveTile(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId,
	direction: -1 | 1,
	wrap = false
): PlacedTile | null {
	const anchor = layoutAnchor(layout, tile);
	const order = visibleOrder(layout, available);
	const currentIndex = order.indexOf(anchor);
	if (currentIndex < 0 || order.length < 2) return null;
	let targetIndex = currentIndex + direction;
	if (wrap) targetIndex = (targetIndex + order.length) % order.length;
	if (targetIndex < 0 || targetIndex >= order.length) return null;
	const placed = placeTile(layout, available, anchor, targetIndex);
	return { ...placed, position: targetIndex + 1, total: order.length };
}

function replaceGroupOrder(
	order: readonly DockTileId[],
	previous: readonly DockTileId[],
	next: readonly DockTileId[]
): DockTileId[] {
	const firstIndex = order.findIndex((tile) => previous.includes(tile));
	const remaining = order.filter((tile) => !previous.includes(tile));
	remaining.splice(firstIndex < 0 ? remaining.length : firstIndex, 0, ...next);
	return remaining;
}

export function selectGroupTab(layout: DockLayout, tile: DockTileId): DockLayout {
	const group = groupFor(layout, tile);
	if (!group || group.active === tile) return layout;
	return {
		...layout,
		groups: layout.groups.map((candidate) =>
			candidate === group ? { ...candidate, active: tile } : candidate
		)
	};
}

export interface ReorderedTab {
	layout: DockLayout;
	position: number;
	total: number;
}

export function reorderGroupTab(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId,
	index: number
): ReorderedTab | null {
	const group = groupFor(layout, tile);
	if (!group) return null;
	const visible = availableGroupMembers(layout, available, group.anchor);
	if (!visible.includes(tile)) return null;
	const nextVisible = visible.filter((member) => member !== tile);
	const bounded = Math.max(0, Math.min(index, nextVisible.length));
	nextVisible.splice(bounded, 0, tile);
	if (nextVisible.every((member, memberIndex) => member === visible[memberIndex])) return null;
	let visibleIndex = 0;
	const nextTiles = group.tiles.map((member) =>
		available.includes(member) ? nextVisible[visibleIndex++] : member
	);
	return {
		layout: {
			...layout,
			order: replaceGroupOrder(layout.order, group.tiles, nextTiles),
			groups: layout.groups.map((candidate) =>
				candidate === group ? { ...candidate, tiles: nextTiles } : candidate
			)
		},
		position: bounded + 1,
		total: visible.length
	};
}

export interface GroupedTiles {
	layout: DockLayout;
	sourceActive: DockTileId;
	targetActive: DockTileId;
	tabCount: number;
}

export function groupTiles(
	layout: DockLayout,
	available: readonly DockTileId[],
	dragging: DockTileId,
	stationary: DockTileId
): GroupedTiles | null {
	const sourceAnchor = layoutAnchor(layout, dragging);
	const targetAnchor = layoutAnchor(layout, stationary);
	if (sourceAnchor === targetAnchor) return null;
	const sourceMembers = [...groupMembers(layout, sourceAnchor)];
	const targetMembers = [...groupMembers(layout, targetAnchor)];
	const sourceActive = activeTile(layout, available, sourceAnchor);
	const targetActive = activeTile(layout, available, targetAnchor);
	const targetIndex = layout.order
		.filter((tile) => !sourceMembers.includes(tile))
		.findIndex((tile) => targetMembers.includes(tile));
	const remaining = layout.order.filter(
		(tile) => !sourceMembers.includes(tile) && !targetMembers.includes(tile)
	);
	const merged = [...targetMembers, ...sourceMembers];
	remaining.splice(Math.max(0, targetIndex), 0, ...merged);
	return {
		layout: {
			...layout,
			order: remaining,
			groups: [
				...layout.groups.filter(
					(group) =>
						!group.tiles.some(
							(tile) => sourceMembers.includes(tile) || targetMembers.includes(tile)
						)
				),
				{ tiles: merged, active: targetActive, anchor: targetAnchor }
			]
		},
		sourceActive,
		targetActive,
		tabCount: merged.length
	};
}

export interface DetachedTab {
	layout: DockLayout;
	previousAnchor: DockTileId;
	nextAnchor: DockTileId;
}

export function detachGroupTab(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId,
	target: DockDropTarget | null = null
): DetachedTab | null {
	const group = groupFor(layout, tile);
	if (!group) return null;
	const anchor = group.anchor;
	const remaining = group.tiles.filter((member) => member !== tile);
	if (!remaining.length) return null;
	const nextAnchor = anchor === tile ? remaining[0] : anchor;
	const nextActive = remaining.includes(group.active)
		? group.active
		: (remaining.find((member) => available.includes(member)) ?? remaining[0]);
	const groupSize = { ...sizeOf(layout, anchor) };
	const groupCollapsed = layout.collapsed[anchor] ?? false;
	const detached: DockLayout = {
		...layout,
		order: replaceGroupOrder(layout.order, group.tiles, [...remaining, tile]),
		groups: [
			...layout.groups.filter((candidate) => candidate !== group),
			...(remaining.length > 1
				? [{ tiles: remaining, active: nextActive, anchor: nextAnchor }]
				: [])
		],
		sizes: {
			...layout.sizes,
			[nextAnchor]: { ...groupSize },
			[tile]: {
				...groupSize,
				column: target?.column ?? groupSize.column,
				columns: target?.columns ?? groupSize.columns
			},
			// tiles that gave way for this drop keep their carved spans; the group is now addressed by its new anchor
			...Object.fromEntries(
				(target?.adjustments ?? []).map((adjustment) => [
					adjustment.tile === anchor ? nextAnchor : adjustment.tile,
					{
						...sizeOf(layout, adjustment.tile),
						column: adjustment.column,
						columns: adjustment.columns
					}
				])
			)
		},
		collapsed: { ...layout.collapsed, [nextAnchor]: groupCollapsed, [tile]: false }
	};
	return {
		layout: target ? placeTile(detached, available, tile, target.index).layout : detached,
		previousAnchor: anchor,
		nextAnchor
	};
}

export function setCollapsed(layout: DockLayout, tile: DockTileId, collapsed: boolean): DockLayout {
	return {
		...layout,
		collapsed: { ...layout.collapsed, [layoutAnchor(layout, tile)]: collapsed }
	};
}

export const isCollapsed = (layout: DockLayout, tile: DockTileId) =>
	layout.collapsed[layoutAnchor(layout, tile)] ?? false;

export function commitDropTarget(
	layout: DockLayout,
	available: readonly DockTileId[],
	tile: DockTileId,
	target: DockDropTarget
): PlacedTile {
	const sized: DockLayout = {
		...layout,
		sizes: {
			...layout.sizes,
			[tile]: {
				...sizeOf(layout, tile),
				column: target.column,
				columns: target.columns ?? sizeOf(layout, tile).columns
			},
			...Object.fromEntries(
				(target.adjustments ?? []).map((adjustment) => [
					adjustment.tile,
					{
						...sizeOf(layout, adjustment.tile),
						column: adjustment.column,
						columns: adjustment.columns
					}
				])
			)
		}
	};
	return placeTile(sized, available, tile, target.index);
}
