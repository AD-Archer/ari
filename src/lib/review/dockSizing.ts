import {
	normalizeTileSize,
	type DockLayout,
	type DockTileId,
	type DockTileSize
} from './dockDefaults';
import {
	groupIntoRows,
	pushLeft,
	pushRight,
	rectsShareRow,
	type DockPacking,
	type PlacedEntry
} from './dockGeometry';
import { sizeOf, type DockSpanOverride } from './dockLayout';

export type DockResizeEdge = 'left' | 'right';

export function sideNeighborRows(
	layout: DockLayout,
	packing: DockPacking,
	visible: readonly DockTileId[],
	tile: DockTileId,
	edge: DockResizeEdge
): DockSpanOverride[][] {
	const tileRect = packing.tiles[tile];
	if (!tileRect) return [];
	const current = sizeOf(layout, tile);
	const side: PlacedEntry[] = [];
	for (const other of visible) {
		if (other === tile) continue;
		const rect = packing.tiles[other];
		if (!rect || !rectsShareRow(rect, tileRect)) continue;
		const { column, columns } = sizeOf(layout, other);
		if (
			(edge === 'right' && column >= current.column + current.columns) ||
			(edge === 'left' && column + columns <= current.column)
		) {
			side.push({ tile: other, column, columns, rect });
		}
	}
	return groupIntoRows(side).map((row) =>
		row
			.sort((first, second) =>
				edge === 'right'
					? first.column - second.column
					: second.column + second.columns - (first.column + first.columns)
			)
			.map((entry) => ({ tile: entry.tile, column: entry.column, columns: entry.columns }))
	);
}

export interface ResizeStart {
	tile: DockTileId;
	edge: DockResizeEdge;
	startWidth: number;
	startHeight: number;
	startColumn: number;
	startColumns: number;
	startCustomHeight: number | null;
	sideNeighborRows: DockSpanOverride[][];
}

export interface ResizeResult {
	sizes: DockSpanOverride[];
	column: number;
	columns: number;
	height: number | null;
	widthChanged: boolean;
	heightChanged: boolean;
}

// growing toward flanking tiles makes room instead of pushing them a row down. every neighbour position
// derives from its size when the resize started, so dragging back restores the rows exactly.
export function resizeByPointer(
	start: ResizeStart,
	deltaX: number,
	deltaY: number,
	workspaceWidth: number,
	stacked: boolean
): ResizeResult {
	let column = start.startColumn;
	let columns = start.startColumns;
	const rightBoundary = start.startColumns + start.startColumn;
	// 6 pixels of slop on each axis before a drag counts
	if (!stacked && Math.abs(deltaX) > 6) {
		// a track is one column plus its 20 pixel gap
		const track = (workspaceWidth + 20) / 12;
		if (start.edge === 'right') {
			columns = Math.max(
				4,
				Math.min(12 - column, Math.round((start.startWidth + deltaX + 20) / Math.max(track, 1)))
			);
		} else {
			column = Math.max(
				0,
				Math.min(
					rightBoundary - 4,
					Math.round((start.startColumn * track + deltaX) / Math.max(track, 1))
				)
			);
			columns = rightBoundary - column;
		}
	}
	const sizes: DockSpanOverride[] = [];
	if (!stacked && start.sideNeighborRows.length) {
		if (start.edge === 'right') {
			const cap = Math.min(...start.sideNeighborRows.map((row) => 12 - column - row.length * 4));
			columns = Math.max(4, Math.min(columns, cap));
			for (const row of start.sideNeighborRows) sizes.push(...pushRight(row, column + columns));
		} else {
			const cap = Math.max(...start.sideNeighborRows.map((row) => row.length * 4));
			column = Math.max(column, cap);
			columns = rightBoundary - column;
			for (const row of start.sideNeighborRows) sizes.push(...pushLeft(row, column));
		}
	}
	let height = start.startCustomHeight;
	if (Math.abs(deltaY) > 6) {
		const desiredHeight = start.startHeight + deltaY;
		height =
			start.startCustomHeight === null && (desiredHeight < 220 || desiredHeight > 900)
				? null
				: Math.max(220, Math.min(900, Math.round(desiredHeight / 10) * 10));
	}
	return {
		sizes,
		column,
		columns,
		height,
		widthChanged: column !== start.startColumn || columns !== start.startColumns,
		heightChanged: Math.abs(deltaY) > 6 && height !== start.startCustomHeight
	};
}

export function applyResize(
	layout: DockLayout,
	tile: DockTileId,
	result: ResizeResult
): DockLayout {
	const sizes = { ...layout.sizes };
	for (const neighbor of result.sizes) {
		sizes[neighbor.tile] = normalizeTileSize(neighbor.tile, {
			...sizeOf(layout, neighbor.tile),
			column: neighbor.column,
			columns: neighbor.columns
		});
	}
	sizes[tile] = normalizeTileSize(tile, {
		column: result.column,
		columns: result.columns,
		height: result.height
	});
	return { ...layout, sizes };
}

// the height slider shows the fitted height (or 420 before the first measurement) while the tile fits its content
export function heightControlValue(size: DockTileSize, fitHeight: number | undefined) {
	if (size.height !== null) return size.height;
	return Math.max(220, Math.min(900, Math.round(fitHeight ?? 420)));
}

const resizeKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home'];

// arrows move the corner one column or 10 pixels; shift makes it two columns or 50 pixels; home fits content
export function resizeByKey(
	current: DockTileSize,
	edge: DockResizeEdge,
	key: string,
	shiftKey: boolean,
	fitHeight: number | undefined
): DockTileSize | null {
	if (!resizeKeys.includes(key)) return null;
	const amount = shiftKey ? 2 : 1;
	const next = { ...current };
	if (key === 'ArrowRight') {
		if (edge === 'left') {
			const shrink = Math.min(amount, current.columns - 4);
			next.column = current.column + shrink;
			next.columns = current.columns - shrink;
		} else {
			next.columns = Math.min(12 - current.column, current.columns + amount);
		}
	} else if (key === 'ArrowLeft') {
		if (edge === 'left') {
			const growth = Math.min(amount, current.column);
			next.column = current.column - growth;
			next.columns = current.columns + growth;
		} else {
			next.columns = Math.max(4, current.columns - amount);
		}
	} else if (key === 'ArrowUp') {
		next.height = Math.max(220, heightControlValue(current, fitHeight) - (shiftKey ? 50 : 10));
	} else if (key === 'ArrowDown') {
		next.height = Math.min(900, heightControlValue(current, fitHeight) + (shiftKey ? 50 : 10));
	} else {
		next.height = null;
	}
	return next;
}
