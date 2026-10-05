import type { DockLayout, DockTileId } from './dockDefaults';
import { sizeOf, type DockSpanOverride } from './dockLayout';

export const dockPlaceholder = '__evidence_tile_placeholder__';
export type DockEntry = DockTileId | typeof dockPlaceholder;

export interface DockRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface DockPacking {
	tiles: Partial<Record<DockTileId, DockRect>>;
	placeholder: DockRect | null;
	height: number;
}

export interface DockMetrics {
	width: number;
	stacked: boolean;
	measuredHeights: Partial<Record<DockTileId, number>>;
	placeholderHeight: number;
}

// 20 is the gap between tiles; a column is a twelfth of what is left after the 11 gaps
export function pixelWidth(columns: number, workspaceWidth: number, stacked: boolean) {
	if (stacked) return Math.max(0, workspaceWidth);
	const columnWidth = Math.max(0, (workspaceWidth - 20 * 11) / 12);
	return columns * columnWidth + (columns - 1) * 20;
}

// tiles stack in one column on narrow screens or when three 320 pixel tiles and two gaps no longer fit
export const isStackedWidth = (width: number, narrowScreen: boolean) =>
	narrowScreen || width < 320 * 3 + 20 * 2;

export function packLayout(
	layout: DockLayout,
	metrics: DockMetrics,
	entries: readonly DockEntry[],
	placeholderTile: DockTileId | null,
	placeholderColumn: number | null,
	placeholderColumns: number | null = null,
	spanOverrides: readonly DockSpanOverride[] | null = null
): DockPacking {
	const { stacked } = metrics;
	const width = Math.max(0, metrics.width);
	const tiles: Partial<Record<DockTileId, DockRect>> = {};
	let placeholder: DockRect | null = null;
	const skyline = Array.from({ length: 12 }, () => 0);
	const spanFor = (candidate: DockTileId) =>
		spanOverrides?.find((entry) => entry.tile === candidate) ?? sizeOf(layout, candidate);
	for (const entry of entries) {
		const tile = entry === dockPlaceholder ? placeholderTile : entry;
		const baseColumns =
			entry === dockPlaceholder && placeholderColumns !== null
				? placeholderColumns
				: tile
					? spanFor(tile).columns
					: 6;
		const columns = stacked ? 12 : Math.max(4, Math.min(12, baseColumns));
		const column = stacked
			? 0
			: Math.max(
					0,
					Math.min(
						12 - columns,
						entry === dockPlaceholder
							? (placeholderColumn ?? (tile ? spanFor(tile).column : 0))
							: tile
								? spanFor(tile).column
								: 0
					)
				);
		const y = Math.max(...skyline.slice(column, column + columns));
		// 42 is the height of a tile header alone, 64 a guess for a tile not measured yet
		const height =
			entry === dockPlaceholder
				? metrics.placeholderHeight
				: Math.max(
						42,
						layout.collapsed[entry]
							? (metrics.measuredHeights[entry] ?? 42)
							: (sizeOf(layout, entry).height ?? metrics.measuredHeights[entry] ?? 64)
					);
		const rect = {
			x: stacked ? 0 : column * ((width - 20 * 11) / 12 + 20),
			y,
			width: stacked ? width : pixelWidth(columns, width, stacked),
			height
		};
		if (entry === dockPlaceholder) placeholder = rect;
		else tiles[entry] = rect;
		for (let occupied = column; occupied < column + columns; occupied++) {
			skyline[occupied] = y + height + 20;
		}
	}
	const height = Math.max(0, ...skyline) - (entries.length ? 20 : 0);
	return { tiles, placeholder, height };
}

export interface PlacedEntry {
	tile: DockTileId;
	rect: DockRect;
	column: number;
	columns: number;
}

export const rectsShareRow = (first: DockRect, second: DockRect) =>
	first.y < second.y + second.height && first.y + first.height > second.y;

// a tall tile can flank a vertical stack, so tiles are grouped into rows by overlapping vertical bands
export function groupIntoRows(placed: PlacedEntry[]): PlacedEntry[][] {
	placed.sort((first, second) => first.rect.y - second.rect.y);
	const rows: PlacedEntry[][] = [];
	for (const entry of placed) {
		const row = rows.find((candidateRow) =>
			candidateRow.some((member) => rectsShareRow(member.rect, entry.rect))
		);
		if (row) row.push(entry);
		else rows.push([entry]);
	}
	return rows;
}

// tiles to the right of a growing edge slide along and shrink only at the grid edge, never under 4 columns
export function pushRight(row: readonly DockSpanOverride[], start: number): DockSpanOverride[] {
	const adjustments: DockSpanOverride[] = [];
	let pressure = start;
	let remaining = row.length;
	for (const member of row) {
		remaining -= 1;
		const nextColumn = Math.max(member.column, pressure);
		const limit = 12 - remaining * 4;
		const nextColumns = Math.max(4, Math.min(member.columns, limit - nextColumn));
		adjustments.push({ tile: member.tile, column: nextColumn, columns: nextColumns });
		pressure = nextColumn + nextColumns;
	}
	return adjustments;
}

export function pushLeft(row: readonly DockSpanOverride[], start: number): DockSpanOverride[] {
	const adjustments: DockSpanOverride[] = [];
	let pressure = start;
	let remaining = row.length;
	for (const member of row) {
		remaining -= 1;
		const nextRight = Math.min(member.column + member.columns, pressure);
		const nextColumn = Math.max(remaining * 4, nextRight - member.columns);
		adjustments.push({
			tile: member.tile,
			column: nextColumn,
			columns: Math.max(4, nextRight - nextColumn)
		});
		pressure = nextColumn;
	}
	return adjustments;
}

export interface ClientRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

// tiles can be very tall, so grouping is limited to the header, where grouped tabs live, and a centre
// zone; the rest of the tile stays available for reordering. the zone is 68% of the width and 55% of
// the height, between 80 by 22 and 520 by 220 pixels, and at least 18 pixels in from the sides (36 / 2)
// and 10 from the top and bottom (20 / 2)
export function inGroupZone(rect: ClientRect, head: ClientRect | null, x: number, y: number) {
	const zoneWidth = Math.max(80, Math.min(rect.width - 36, rect.width * 0.68, 520));
	const zoneHeight = Math.max(22, Math.min(rect.height - 20, rect.height * 0.55, 220));
	const insetX = (rect.width - zoneWidth) / 2;
	const insetY = (rect.height - zoneHeight) / 2;
	const inCenterZone =
		x >= rect.left + insetX &&
		x <= rect.right - insetX &&
		y >= rect.top + insetY &&
		y <= rect.bottom - insetY;
	const inHead =
		head !== null && x >= head.left && x <= head.right && y >= head.top && y <= head.bottom;
	return inCenterZone || inHead;
}

// a held group candidate stays while the pointer is within 28 pixels of its tile
export const inStickyZone = (rect: ClientRect, x: number, y: number) =>
	x >= rect.left - 28 && x <= rect.right + 28 && y >= rect.top - 28 && y <= rect.bottom + 28;

// scrolling starts within 18% of the viewport edge (48 to 92 pixels) and ramps up to 24 pixels a frame
export function autoScrollVelocity(pointerY: number, top: number, bottom: number) {
	const edge = Math.min(92, Math.max(48, (bottom - top) * 0.18));
	if (pointerY < top + edge) {
		const pressure = Math.max(0, Math.min(1, (top + edge - pointerY) / edge));
		return -24 * pressure * pressure;
	}
	if (pointerY > bottom - edge) {
		const pressure = Math.max(0, Math.min(1, (pointerY - (bottom - edge)) / edge));
		return 24 * pressure * pressure;
	}
	return 0;
}
