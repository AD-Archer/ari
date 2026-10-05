import type { DockLayout, DockTileId } from './dockDefaults';
import {
	dockPlaceholder,
	groupIntoRows,
	packLayout,
	pixelWidth,
	pushLeft,
	pushRight,
	type DockEntry,
	type DockMetrics,
	type DockRect
} from './dockGeometry';
import { sizeOf, type DockDropTarget, type DockSpanOverride } from './dockLayout';

// placements are scored by distance from the pointer plus how far they shove existing tiles, so free
// space beats pushing a row down. it also tries narrower widths and carving room out of a row, and it
// keeps the previous target unless another is clearly better so the layout does not churn.
export function searchPlacement(
	layout: DockLayout,
	metrics: DockMetrics,
	candidates: readonly DockTileId[],
	placeholderTile: DockTileId,
	preferred: number,
	desiredTop: number,
	desiredLeftFor: (columns: number) => number,
	previous: DockDropTarget | null
): DockDropTarget | null {
	const { stacked } = metrics;
	// a track is one column plus its 20 pixel gap
	const track = (Math.max(0, metrics.width) + 20) / 12;
	const columnFor = (columns: number) =>
		stacked
			? 0
			: Math.max(
					0,
					Math.min(12 - columns, Math.round(desiredLeftFor(columns) / Math.max(track, 1)))
				);
	const baseline = packLayout(layout, metrics, [...candidates], null, null);
	const evaluate = (
		index: number,
		column: number,
		columns: number,
		adjustments: DockSpanOverride[] | null = null
	) => {
		const entries: DockEntry[] = [...candidates];
		entries.splice(Math.max(0, Math.min(index, entries.length)), 0, dockPlaceholder);
		const packing = packLayout(
			layout,
			metrics,
			entries,
			placeholderTile,
			column,
			columns,
			adjustments
		);
		if (!packing.placeholder) return null;
		let displacement = 0;
		for (const candidate of candidates) {
			const before = baseline.tiles[candidate];
			const after = packing.tiles[candidate];
			if (before && after) displacement += Math.abs(after.y - before.y);
		}
		// sideways distance weighs 0.6 of vertical distance, and a pixel of shoved tile half of one
		return (
			Math.abs(packing.placeholder.y - desiredTop) +
			Math.abs(packing.placeholder.x - desiredLeftFor(columns)) * 0.6 +
			displacement / 2
		);
	};
	let best: (DockDropTarget & { score: number }) | null = null;
	for (let columns = preferred; columns >= 4; columns -= 1) {
		const column = columnFor(columns);
		let bestForWidth: { index: number; score: number } | null = null;
		for (let index = 0; index <= candidates.length; index += 1) {
			const score = evaluate(index, column, columns);
			if (score === null) continue;
			if (!bestForWidth || score < bestForWidth.score) bestForWidth = { index, score };
		}
		// a narrower width has to win by 8 pixels of score to be chosen
		if (bestForWidth && (!best || bestForWidth.score < best.score - 8)) {
			best = { ...bestForWidth, column, columns };
		}
		if (stacked) break;
	}
	if (!stacked) {
		const placed = candidates.flatMap((candidate) => {
			const rect = baseline.tiles[candidate];
			const size = sizeOf(layout, candidate);
			return rect ? [{ tile: candidate, rect, column: size.column, columns: size.columns }] : [];
		});
		for (const row of groupIntoRows(placed)) {
			row.sort((first, second) => first.column - second.column);
			for (let boundary = 0; boundary <= row.length; boundary += 1) {
				let carveColumn: number;
				let carveColumns: number;
				let adjustments: DockSpanOverride[];
				if (boundary < row.length) {
					const affected = row.slice(boundary);
					carveColumn = row[boundary].column;
					carveColumns = Math.min(preferred, 12 - carveColumn - affected.length * 4);
					if (carveColumns < 4) continue;
					adjustments = pushRight(affected, carveColumn + carveColumns);
				} else {
					const affected = [...row].reverse();
					carveColumns = Math.min(preferred, 12 - affected.length * 4);
					if (carveColumns < 4) continue;
					carveColumn = 12 - carveColumns;
					adjustments = pushLeft(affected, carveColumn);
				}
				// a carve that moves nothing is free space the plain candidates already cover
				if (
					adjustments.every((adjustment) => {
						const size = sizeOf(layout, adjustment.tile);
						return adjustment.column === size.column && adjustment.columns === size.columns;
					})
				) {
					continue;
				}
				const entryIndex =
					boundary < row.length
						? candidates.indexOf(row[boundary].tile)
						: candidates.indexOf(row[row.length - 1].tile) + 1;
				const score = evaluate(entryIndex, carveColumn, carveColumns, adjustments);
				if (score === null) continue;
				// the 24 point penalty keeps free space preferred when both are equally close to the pointer
				const carveScore = score + 24;
				if (!best || carveScore < best.score - 8) {
					best = {
						index: entryIndex,
						column: carveColumn,
						columns: carveColumns,
						score: carveScore,
						adjustments
					};
				}
			}
		}
	}
	if (!best) return null;
	if (previous && previous.index <= candidates.length) {
		const previousColumns = Math.max(4, Math.min(12, previous.columns ?? preferred));
		const previousScore = evaluate(
			previous.index,
			previous.column,
			previousColumns,
			previous.adjustments ?? null
		);
		// the held target survives until another beats it by more than 12 points
		if (previousScore !== null && previousScore <= best.score + 12) {
			return {
				index: previous.index,
				column: previous.column,
				columns: previousColumns,
				adjustments: previous.adjustments
			};
		}
	}
	return {
		index: best.index,
		column: best.column,
		columns: best.columns,
		adjustments: best.adjustments
	};
}

export interface DropPointer {
	localX: number;
	localY: number;
	workspaceWidth: number;
	grabRatioX: number | null;
	grabY: number | null;
}

export function dropTargetAt(
	layout: DockLayout,
	metrics: DockMetrics,
	visible: readonly DockTileId[],
	dragging: DockTileId,
	pointer: DropPointer,
	previous: DockDropTarget | null
): DockDropTarget {
	const { stacked } = metrics;
	const size = sizeOf(layout, dragging);
	const preferred = stacked ? 12 : Math.max(4, Math.min(12, size.columns));
	// the dragged tile stays anchored under the grabbed point
	const desiredLeftFor = (columns: number) =>
		pointer.localX -
		(pointer.grabRatioX ?? 0.5) * pixelWidth(columns, pointer.workspaceWidth, stacked);
	const track = (pointer.workspaceWidth + 20) / 12;
	const fallbackColumn = stacked
		? size.column
		: Math.max(
				0,
				Math.min(12 - preferred, Math.round(desiredLeftFor(preferred) / Math.max(track, 1)))
			);
	const candidates = visible.filter((tile) => tile !== dragging);
	if (!candidates.length) return { index: 0, column: fallbackColumn, columns: preferred };
	const desiredTop = pointer.localY - (pointer.grabY ?? metrics.placeholderHeight / 2);
	return (
		searchPlacement(
			layout,
			metrics,
			candidates,
			dragging,
			preferred,
			desiredTop,
			desiredLeftFor,
			previous
		) ?? { index: candidates.length, column: fallbackColumn, columns: preferred }
	);
}

export interface ClientBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
}

// the empty page up to 72 pixels past the tiles still counts as the evidence area
export const nearWorkspace = (box: ClientBox, x: number, y: number) =>
	x >= box.left - 72 && x <= box.right + 72 && y >= box.top - 72 && y <= box.bottom + 72;

export function detachedTabTargetAt(
	layout: DockLayout,
	metrics: DockMetrics,
	visible: readonly DockTileId[],
	tile: DockTileId,
	box: ClientBox,
	x: number,
	y: number,
	previous: DockDropTarget | null
): DockDropTarget | null {
	if (!nearWorkspace(box, x, y)) return null;
	const { stacked } = metrics;
	// a drop just past the edge means the nearest slot, not a cancelled drag
	const localX = Math.max(box.left, Math.min(box.right, x)) - box.left;
	const localY = Math.max(box.top, Math.min(box.bottom, y)) - box.top;
	// the detached tab targets at its own stored size: a full-width group would leave one possible position
	const preferred = stacked ? 12 : Math.max(4, Math.min(12, sizeOf(layout, tile).columns));
	const desiredLeftFor = (columns: number) => localX - pixelWidth(columns, box.width, stacked) / 2;
	const track = (box.width + 20) / 12;
	const fallbackColumn = stacked
		? 0
		: Math.max(
				0,
				Math.min(12 - preferred, Math.round(desiredLeftFor(preferred) / Math.max(track, 1)))
			);
	// 22 is about half a tile header, so the header lands under the pointer
	const desiredTop = localY - 22;
	return (
		searchPlacement(
			layout,
			metrics,
			visible,
			tile,
			preferred,
			desiredTop,
			desiredLeftFor,
			previous
		) ?? { index: visible.length, column: fallbackColumn, columns: preferred }
	);
}

export function detachedTabPreview(
	layout: DockLayout,
	metrics: DockMetrics,
	visible: readonly DockTileId[],
	tile: DockTileId,
	target: DockDropTarget
): DockRect | null {
	const entries: DockEntry[] = [...visible];
	entries.splice(Math.max(0, Math.min(target.index, entries.length)), 0, dockPlaceholder);
	return packLayout(
		layout,
		metrics,
		entries,
		tile,
		target.column,
		target.columns ?? null,
		target.adjustments ?? null
	).placeholder;
}
