import { describe, expect, test } from 'bun:test';
import {
	defaultDockLayout,
	dockTileIds,
	normalizeTileSize,
	type DockLayout,
	type DockTileId
} from './dockDefaults';
import {
	activeTile,
	alignTile,
	commitDropTarget,
	detachGroupTab,
	groupTiles,
	moveTile,
	orderedAvailableTiles,
	placeTile,
	placementOptions,
	reorderGroupTab,
	resetTileSize,
	selectGroupTab,
	setCollapsed,
	setTileColumns,
	setTileHeight,
	sizeOf,
	visibleOrder,
	widthPercent
} from './dockLayout';

const everyTile: DockTileId[] = [...dockTileIds];
const grouped = (): DockLayout => {
	const first = groupTiles(defaultDockLayout(), everyTile, 'elapsed', 'devlog');
	return groupTiles(first!.layout, everyTile, 'files', 'devlog')!.layout;
};

describe('defaults', () => {
	test('commits is full width above two columns of half-width tiles', () => {
		const layout = defaultDockLayout();
		expect(layout.order).toEqual([
			'commits',
			'devlog',
			'readme',
			'aicheck',
			'history',
			'elapsed',
			'hackatime',
			'files',
			'pastprojects'
		]);
		expect(layout.sizes.commits).toEqual({ column: 0, columns: 12, height: null });
		expect(layout.sizes.devlog).toEqual({ column: 0, columns: 6, height: null });
		expect(layout.sizes.elapsed).toEqual({ column: 6, columns: 6, height: null });
		expect(layout.groups).toEqual([]);
	});
});

describe('normalizeTileSize', () => {
	test('clamps columns to 4..12 and keeps the tile inside the grid', () => {
		expect(normalizeTileSize('devlog', { column: 11, columns: 2, height: null })).toEqual({
			column: 8,
			columns: 4,
			height: null
		});
		expect(normalizeTileSize('devlog', { column: -3, columns: 40, height: null })).toEqual({
			column: 0,
			columns: 12,
			height: null
		});
	});
	test('rounds fractional spans and snaps height to 10 pixel steps within 220..900', () => {
		expect(normalizeTileSize('devlog', { column: 2.5, columns: 5.4, height: 333 })).toEqual({
			column: 3,
			columns: 5,
			height: 330
		});
		expect(
			sizeOf(
				{ ...defaultDockLayout(), sizes: { files: { column: 0, columns: 6, height: 50 } } },
				'files'
			).height
		).toBe(220);
		expect(normalizeTileSize('files', { column: 0, columns: 6, height: 5000 }).height).toBe(900);
	});
	test('falls back to the default for missing or malformed values', () => {
		expect(normalizeTileSize('elapsed', undefined)).toEqual({
			column: 6,
			columns: 6,
			height: null
		});
		expect(normalizeTileSize('elapsed', { columns: 'wide', column: NaN })).toEqual({
			column: 6,
			columns: 6,
			height: null
		});
		expect(normalizeTileSize('elapsed', { columns: 10 })).toEqual({
			column: 2,
			columns: 10,
			height: null
		});
	});
});

describe('visible order and availability', () => {
	test('unavailable tiles are left out of what is drawn but stay in the saved order', () => {
		const layout = defaultDockLayout();
		const available: DockTileId[] = ['commits', 'history', 'devlog'];
		expect(visibleOrder(layout, available)).toEqual(['commits', 'devlog', 'history']);
		expect(orderedAvailableTiles(layout, available)).toEqual(['commits', 'devlog', 'history']);
		expect(layout.order).toHaveLength(9);
	});
	test('a tile that becomes available again reappears at its saved position', () => {
		const moved = placeTile(defaultDockLayout(), everyTile, 'files', 0).layout;
		expect(visibleOrder(moved, ['commits', 'devlog'])).toEqual(['commits', 'devlog']);
		expect(visibleOrder(moved, ['commits', 'devlog', 'files'])).toEqual([
			'files',
			'commits',
			'devlog'
		]);
	});
	test('a group whose members are all unavailable is hidden; a partly available one shows the rest', () => {
		const layout = grouped();
		expect(visibleOrder(layout, ['commits', 'readme'])).toEqual(['commits', 'readme']);
		expect(visibleOrder(layout, ['commits', 'files'])).toEqual(['commits', 'devlog']);
		expect(activeTile(layout, ['commits', 'files'], 'devlog')).toBe('files');
	});
});

describe('placeTile and moveTile', () => {
	test('places by visible index and keeps hidden tiles after the visible run', () => {
		const available: DockTileId[] = ['commits', 'devlog', 'history', 'files'];
		const placed = placeTile(defaultDockLayout(), available, 'files', 1);
		expect(placed.position).toBe(2);
		expect(placed.total).toBe(4);
		expect(placed.layout.order).toEqual([
			'commits',
			'files',
			'devlog',
			'history',
			'readme',
			'aicheck',
			'elapsed',
			'hackatime',
			'pastprojects'
		]);
	});
	test('clamps the index', () => {
		expect(placeTile(defaultDockLayout(), everyTile, 'commits', 99).position).toBe(9);
		expect(placeTile(defaultDockLayout(), everyTile, 'files', -4).layout.order[0]).toBe('files');
	});
	test('moves one step, stops at the ends, and wraps only when asked', () => {
		const layout = defaultDockLayout();
		expect(moveTile(layout, everyTile, 'commits', -1)).toBeNull();
		expect(moveTile(layout, everyTile, 'pastprojects', 1)).toBeNull();
		const wrapped = moveTile(layout, everyTile, 'pastprojects', 1, true);
		expect(wrapped?.position).toBe(1);
		expect(wrapped?.layout.order[0]).toBe('pastprojects');
		const stepped = moveTile(layout, everyTile, 'commits', 1);
		expect(stepped?.layout.order.slice(0, 2)).toEqual(['devlog', 'commits']);
		expect(stepped?.total).toBe(9);
	});
	test('a group moves as one block', () => {
		const moved = placeTile(grouped(), everyTile, 'files', 0);
		expect(moved.anchor).toBe('devlog');
		expect(moved.layout.order.slice(0, 4)).toEqual(['devlog', 'elapsed', 'files', 'commits']);
	});
	test('with a single visible tile nothing moves', () => {
		expect(moveTile(defaultDockLayout(), ['commits'], 'commits', 1, true)).toBeNull();
	});
});

describe('tab groups', () => {
	test('grouping merges the dragged tile into the stationary one, which stays the anchor', () => {
		const result = groupTiles(defaultDockLayout(), everyTile, 'elapsed', 'devlog')!;
		expect(result.layout.groups).toEqual([
			{ tiles: ['devlog', 'elapsed'], active: 'devlog', anchor: 'devlog' }
		]);
		expect(result.layout.order.slice(0, 4)).toEqual(['commits', 'devlog', 'elapsed', 'readme']);
		expect(result.sourceActive).toBe('elapsed');
		expect(result.targetActive).toBe('devlog');
		expect(result.tabCount).toBe(2);
	});
	test('grouping two groups merges all tabs; grouping a tile with itself does nothing', () => {
		const first = groupTiles(defaultDockLayout(), everyTile, 'elapsed', 'devlog')!.layout;
		const second = groupTiles(first, everyTile, 'history', 'readme')!.layout;
		const merged = groupTiles(second, everyTile, 'readme', 'elapsed')!;
		expect(merged.layout.groups).toEqual([
			{ tiles: ['devlog', 'elapsed', 'readme', 'history'], active: 'devlog', anchor: 'devlog' }
		]);
		expect(groupTiles(first, everyTile, 'elapsed', 'devlog')).toBeNull();
	});
	test('selecting a tab changes only the active member', () => {
		const layout = selectGroupTab(grouped(), 'files');
		expect(layout.groups[0].active).toBe('files');
		expect(activeTile(layout, everyTile, 'devlog')).toBe('files');
		expect(selectGroupTab(layout, 'commits')).toBe(layout);
	});
	test('reordering tabs moves within the visible members and keeps hidden ones in place', () => {
		const layout = grouped();
		const reordered = reorderGroupTab(layout, everyTile, 'files', 0)!;
		expect(reordered.layout.groups[0].tiles).toEqual(['files', 'devlog', 'elapsed']);
		expect(reordered.layout.order.slice(1, 4)).toEqual(['files', 'devlog', 'elapsed']);
		expect(reordered.position).toBe(1);
		expect(reordered.total).toBe(3);
		expect(reorderGroupTab(layout, everyTile, 'files', 2)).toBeNull();
		const partial = reorderGroupTab(layout, ['devlog', 'files'], 'files', 0)!;
		expect(partial.layout.groups[0].tiles).toEqual(['files', 'elapsed', 'devlog']);
	});
	test('detaching a tab puts it after the group with the group size and expands it', () => {
		const collapsed = setCollapsed(grouped(), 'devlog', true);
		const detached = detachGroupTab(collapsed, everyTile, 'elapsed')!;
		expect(detached.layout.groups).toEqual([
			{ tiles: ['devlog', 'files'], active: 'devlog', anchor: 'devlog' }
		]);
		expect(detached.layout.order.slice(1, 4)).toEqual(['devlog', 'files', 'elapsed']);
		expect(detached.layout.sizes.elapsed).toEqual({ column: 0, columns: 6, height: null });
		expect(detached.layout.collapsed).toEqual({ devlog: true, elapsed: false });
	});
	test('detaching the anchor hands the group, its size and its collapse state to the next member', () => {
		const tall = setTileHeight(grouped(), 'devlog', 400);
		const detached = detachGroupTab(tall, everyTile, 'devlog')!;
		expect(detached.previousAnchor).toBe('devlog');
		expect(detached.nextAnchor).toBe('elapsed');
		expect(detached.layout.groups).toEqual([
			{ tiles: ['elapsed', 'files'], active: 'elapsed', anchor: 'elapsed' }
		]);
		expect(detached.layout.sizes.elapsed).toEqual({ column: 0, columns: 6, height: 400 });
		expect(detached.layout.sizes.devlog).toEqual({ column: 0, columns: 6, height: 400 });
	});
	test('detaching from a pair dissolves the group', () => {
		const pair = groupTiles(defaultDockLayout(), everyTile, 'elapsed', 'devlog')!.layout;
		expect(detachGroupTab(pair, everyTile, 'elapsed')!.layout.groups).toEqual([]);
		expect(detachGroupTab(pair, everyTile, 'commits')).toBeNull();
	});
	test('detaching onto a drop target takes its span, applies carved spans and places it', () => {
		const detached = detachGroupTab(grouped(), everyTile, 'files', {
			index: 0,
			column: 8,
			columns: 4,
			adjustments: [{ tile: 'devlog', column: 0, columns: 8 }]
		})!;
		expect(detached.layout.order[0]).toBe('files');
		expect(detached.layout.sizes.files).toEqual({ column: 8, columns: 4, height: null });
		expect(detached.layout.sizes.devlog).toEqual({ column: 0, columns: 8, height: null });
	});
});

describe('sizes', () => {
	test('width, height, alignment and reset', () => {
		let layout = setTileColumns(defaultDockLayout(), 'elapsed', 9);
		expect(sizeOf(layout, 'elapsed')).toEqual({ column: 3, columns: 9, height: null });
		expect(widthPercent(layout, 'elapsed')).toBe(75);
		layout = setTileColumns(layout, 'elapsed', 4);
		expect(placementOptions(layout, 'elapsed').map((option) => option.alignment)).toEqual([
			'start',
			'center',
			'end'
		]);
		expect(sizeOf(alignTile(layout, 'elapsed', 'center'), 'elapsed').column).toBe(4);
		expect(sizeOf(alignTile(layout, 'elapsed', 'end'), 'elapsed').column).toBe(8);
		expect(placementOptions(layout, 'commits')).toEqual([]);
		layout = setTileColumns(layout, 'elapsed', 11);
		expect(placementOptions(layout, 'elapsed').map((option) => option.label)).toEqual([
			'Left',
			'Right'
		]);
		layout = setTileHeight(layout, 'elapsed', 404);
		expect(sizeOf(layout, 'elapsed').height).toBe(400);
		expect(sizeOf(resetTileSize(layout, 'elapsed'), 'elapsed')).toEqual({
			column: 1,
			columns: 6,
			height: null
		});
	});
	test('committing a drop writes the span, the carved neighbours and the order', () => {
		const placed = commitDropTarget(defaultDockLayout(), everyTile, 'history', {
			index: 1,
			column: 8,
			columns: 4,
			adjustments: [{ tile: 'devlog', column: 0, columns: 8 }]
		});
		expect(placed.layout.order.slice(0, 3)).toEqual(['commits', 'history', 'devlog']);
		expect(sizeOf(placed.layout, 'history')).toEqual({ column: 8, columns: 4, height: null });
		expect(sizeOf(placed.layout, 'devlog')).toEqual({ column: 0, columns: 8, height: null });
		expect(placed.position).toBe(2);
	});
});
