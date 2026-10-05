import { describe, expect, test } from 'bun:test';
import { defaultDockLayout, dockTileIds, type DockLayout, type DockTileId } from './dockDefaults';
import {
	autoScrollVelocity,
	dockPlaceholder,
	inGroupZone,
	inStickyZone,
	isStackedWidth,
	packLayout,
	pixelWidth,
	type DockMetrics,
	type DockRect
} from './dockGeometry';
import { groupTiles, setTileColumns, setTileSize, sizeOf, visibleOrder } from './dockLayout';
import { detachedTabTargetAt, dropTargetAt, searchPlacement } from './dockPlacement';
import {
	applyResize,
	heightControlValue,
	resizeByKey,
	resizeByPointer,
	sideNeighborRows,
	type ResizeStart
} from './dockSizing';

const everyTile: DockTileId[] = [...dockTileIds];
const heights = (height: number) =>
	Object.fromEntries(everyTile.map((tile) => [tile, height])) as Record<DockTileId, number>;
const metrics = (overrides: Partial<DockMetrics> = {}): DockMetrics => ({
	width: 1200,
	stacked: false,
	measuredHeights: heights(100),
	placeholderHeight: 100,
	...overrides
});

describe('packLayout', () => {
	test('default layout at 1200 wide: full-width row, then two columns', () => {
		const layout = defaultDockLayout();
		const packing = packLayout(layout, metrics(), visibleOrder(layout, everyTile), null, null);
		expect(packing.tiles.commits).toEqual({ x: 0, y: 0, width: 1200, height: 100 });
		expect(packing.tiles.devlog).toEqual({ x: 0, y: 120, width: 590, height: 100 });
		expect(packing.tiles.elapsed).toEqual({ x: 610, y: 120, width: 590, height: 100 });
		expect(packing.tiles.readme?.y).toBe(240);
		expect(packing.tiles.pastprojects).toEqual({ x: 610, y: 480, width: 590, height: 100 });
		expect(packing.height).toBe(580);
	});
	test('a custom height wins over the measured one; a collapsed tile uses its measured height', () => {
		let layout = setTileSize(defaultDockLayout(), 'commits', {
			column: 0,
			columns: 12,
			height: 300
		});
		const order: DockTileId[] = ['commits', 'devlog'];
		expect(packLayout(layout, metrics(), order, null, null).tiles.devlog?.y).toBe(320);
		layout = { ...layout, collapsed: { commits: true } };
		const collapsed = packLayout(
			layout,
			metrics({ measuredHeights: { commits: 42, devlog: 100 } }),
			order,
			null,
			null
		);
		expect(collapsed.tiles.devlog?.y).toBe(62);
	});
	test('unmeasured tiles get 64 pixels and nothing is shorter than 42', () => {
		const layout = defaultDockLayout();
		const packing = packLayout(
			layout,
			metrics({ measuredHeights: { commits: 10 } }),
			['commits', 'devlog'],
			null,
			null
		);
		expect(packing.tiles.commits?.height).toBe(42);
		expect(packing.tiles.devlog?.height).toBe(64);
	});
	test('stacked: every tile is full width in order', () => {
		const layout = defaultDockLayout();
		const packing = packLayout(
			layout,
			metrics({ width: 400, stacked: true }),
			['commits', 'devlog', 'elapsed'],
			null,
			null
		);
		expect(packing.tiles.elapsed).toEqual({ x: 0, y: 240, width: 400, height: 100 });
		expect(packing.height).toBe(340);
	});
	test('the placeholder takes the dragged tile span unless a column or width is given', () => {
		const layout = defaultDockLayout();
		const packing = packLayout(
			layout,
			metrics({ placeholderHeight: 80 }),
			['commits', dockPlaceholder, 'devlog'],
			'elapsed',
			null
		);
		expect(packing.placeholder).toEqual({ x: 610, y: 120, width: 590, height: 80 });
		expect(packing.tiles.devlog?.y).toBe(120);
		const narrow = packLayout(layout, metrics(), [dockPlaceholder], 'elapsed', 0, 4);
		expect(narrow.placeholder?.x).toBe(0);
		expect(narrow.placeholder?.width).toBeCloseTo(pixelWidth(4, 1200, false), 6);
	});
	test('span overrides replace a tile span without touching its height', () => {
		const layout = defaultDockLayout();
		const packing = packLayout(layout, metrics(), ['devlog'], null, null, null, [
			{ tile: 'devlog', column: 8, columns: 4 }
		]);
		expect(packing.tiles.devlog?.x).toBeCloseTo(8 * ((1200 - 220) / 12 + 20), 6);
		expect(packing.tiles.devlog?.width).toBeCloseTo(pixelWidth(4, 1200, false), 6);
	});
	test('an empty workspace has no height', () => {
		expect(packLayout(defaultDockLayout(), metrics(), [], null, null).height).toBe(0);
	});
	test('stacking threshold', () => {
		expect(isStackedWidth(999, false)).toBe(true);
		expect(isStackedWidth(1000, false)).toBe(false);
		expect(isStackedWidth(1400, true)).toBe(true);
	});
});

// mulberry32: a small seeded generator so a failing case can be replayed
function seeded(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}

const overlaps = (first: DockRect, second: DockRect) =>
	first.x < second.x + second.width - 0.001 &&
	second.x < first.x + first.width - 0.001 &&
	first.y < second.y + second.height - 0.001 &&
	second.y < first.y + first.height - 0.001;

describe('packLayout property', () => {
	test('never overlaps tiles and never loses one, for 400 random layouts', () => {
		for (let seed = 1; seed <= 400; seed += 1) {
			const random = seeded(seed);
			const pick = (limit: number) => Math.floor(random() * limit);
			const order = [...everyTile];
			for (let index = order.length - 1; index > 0; index -= 1) {
				const other = pick(index + 1);
				[order[index], order[other]] = [order[other], order[index]];
			}
			let layout: DockLayout = { ...defaultDockLayout(), order };
			const measured: Partial<Record<DockTileId, number>> = {};
			for (const tile of everyTile) {
				layout = setTileSize(layout, tile, {
					column: pick(12),
					columns: 4 + pick(9),
					height: random() < 0.4 ? 220 + pick(69) * 10 : null
				});
				if (random() < 0.2)
					layout = { ...layout, collapsed: { ...layout.collapsed, [tile]: true } };
				if (random() < 0.9) measured[tile] = 42 + pick(700);
			}
			const available = everyTile.filter(() => random() < 0.8);
			if (available.length >= 2 && random() < 0.5) {
				const grouped = groupTiles(layout, available, available[0], available[1]);
				if (grouped) layout = grouped.layout;
			}
			const visible = visibleOrder(layout, available);
			const stacked = random() < 0.25;
			const width = stacked ? 320 + pick(600) : 1000 + pick(900);
			const packing = packLayout(
				layout,
				{ width, stacked, measuredHeights: measured, placeholderHeight: 64 },
				visible,
				null,
				null
			);
			const rects = visible.map((tile) => packing.tiles[tile]);
			expect(Object.keys(packing.tiles).sort()).toEqual([...visible].sort());
			let bottom = 0;
			rects.forEach((rect, index) => {
				expect(rect).toBeDefined();
				expect(rect!.x).toBeGreaterThanOrEqual(0);
				expect(rect!.x + rect!.width).toBeLessThanOrEqual(width + 0.001);
				expect(rect!.height).toBeGreaterThanOrEqual(42);
				bottom = Math.max(bottom, rect!.y + rect!.height);
				for (let other = index + 1; other < rects.length; other += 1) {
					if (overlaps(rect!, rects[other]!)) {
						throw new Error(`seed ${seed}: ${visible[index]} overlaps ${visible[other]}`);
					}
				}
			});
			expect(packing.height).toBeCloseTo(bottom, 6);
		}
	});
});

describe('placement search', () => {
	const layout = defaultDockLayout();
	const visible: DockTileId[] = ['commits', 'devlog', 'elapsed', 'readme'];
	test('a tile dropped where it already sits keeps its index and column', () => {
		const target = dropTargetAt(
			layout,
			metrics(),
			visible,
			'elapsed',
			{ localX: 900, localY: 130, workspaceWidth: 1200, grabRatioX: 0.5, grabY: 10 },
			null
		);
		expect(target.column).toBe(6);
		expect(target.columns).toBe(6);
		// before or after devlog packs identically; the earlier index wins the tie
		expect(target.index).toBe(1);
		expect(target.adjustments).toBeUndefined();
	});
	test('dragging to the top left asks for the first slot', () => {
		const target = dropTargetAt(
			layout,
			metrics(),
			visible,
			'readme',
			{ localX: 200, localY: 0, workspaceWidth: 1200, grabRatioX: 0.5, grabY: 0 },
			null
		);
		expect(target.index).toBe(0);
		expect(target.column).toBe(0);
	});
	test('a held previous target survives a marginally better alternative', () => {
		const pointer = { localX: 900, localY: 130, workspaceWidth: 1200, grabRatioX: 0.5, grabY: 10 };
		const previous = { index: 3, column: 6, columns: 6 };
		const kept = dropTargetAt(layout, metrics(), visible, 'elapsed', pointer, previous);
		expect(kept.index).toBe(3);
		expect(kept.column).toBe(6);
	});
	test('stacked placement only chooses an index', () => {
		const target = dropTargetAt(
			layout,
			metrics({ width: 400, stacked: true }),
			visible,
			'readme',
			{ localX: 100, localY: 125, workspaceWidth: 400, grabRatioX: 0.5, grabY: 0 },
			null
		);
		expect(target.columns).toBe(12);
		expect(target.column).toBe(0);
		expect(target.index).toBe(1);
	});
	test('with nothing else on screen the tile lands at index 0', () => {
		const target = dropTargetAt(
			layout,
			metrics(),
			['readme'],
			'readme',
			{ localX: 900, localY: 0, workspaceWidth: 1200, grabRatioX: 0.5, grabY: 0 },
			null
		);
		expect(target).toEqual({ index: 0, column: 6, columns: 6 });
	});
	test('carving: a row of two half tiles gives way to a third, each shrinking to 4 columns', () => {
		const row: DockTileId[] = ['devlog', 'elapsed'];
		const target = searchPlacement(layout, metrics(), row, 'readme', 6, 0, () => 1200, null);
		expect(target?.columns).toBe(4);
		expect(target?.column).toBe(8);
		expect(target?.adjustments).toEqual([
			{ tile: 'elapsed', column: 4, columns: 4 },
			{ tile: 'devlog', column: 0, columns: 4 }
		]);
	});
	test('a torn-off tab outside the 72 pixel margin has no target; just past the edge clamps inside', () => {
		const box = { left: 100, top: 100, right: 1300, bottom: 700, width: 1200 };
		expect(detachedTabTargetAt(layout, metrics(), visible, 'files', box, 20, 300, null)).toBeNull();
		const near = detachedTabTargetAt(layout, metrics(), visible, 'files', box, 60, 300, null);
		expect(near).not.toBeNull();
		expect(near!.column).toBe(0);
	});
});

describe('zones and auto-scroll', () => {
	const rect = { left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 };
	const head = { left: 0, top: 0, right: 600, bottom: 42, width: 600, height: 42 };
	test('grouping needs the centre zone or the header', () => {
		expect(inGroupZone(rect, head, 300, 200)).toBe(true);
		expect(inGroupZone(rect, head, 20, 20)).toBe(true);
		expect(inGroupZone(rect, null, 20, 20)).toBe(false);
		expect(inGroupZone(rect, head, 20, 380)).toBe(false);
	});
	test('the sticky zone reaches 28 pixels past the tile', () => {
		expect(inStickyZone(rect, 620, 420)).toBe(true);
		expect(inStickyZone(rect, 640, 200)).toBe(false);
	});
	test('auto-scroll ramps quadratically inside the edge band and is zero elsewhere', () => {
		expect(autoScrollVelocity(450, 0, 900)).toBe(0);
		expect(autoScrollVelocity(0, 0, 900)).toBe(-24);
		expect(autoScrollVelocity(900, 0, 900)).toBe(24);
		expect(autoScrollVelocity(46, 0, 900)).toBeCloseTo(-6, 6);
	});
});

describe('resize', () => {
	const layout = defaultDockLayout();
	const visible: DockTileId[] = ['devlog', 'elapsed'];
	const packing = packLayout(layout, metrics(), visible, null, null);
	const start = (overrides: Partial<ResizeStart> = {}): ResizeStart => ({
		tile: 'devlog',
		edge: 'right',
		startWidth: 590,
		startHeight: 100,
		startColumn: 0,
		startColumns: 6,
		startCustomHeight: null,
		sideNeighborRows: sideNeighborRows(layout, packing, visible, 'devlog', 'right'),
		...overrides
	});
	test('finds the tiles flanking the dragged edge', () => {
		expect(sideNeighborRows(layout, packing, visible, 'devlog', 'right')).toEqual([
			[{ tile: 'elapsed', column: 6, columns: 6 }]
		]);
		expect(sideNeighborRows(layout, packing, visible, 'devlog', 'left')).toEqual([]);
		expect(sideNeighborRows(layout, packing, visible, 'elapsed', 'left')).toEqual([
			[{ tile: 'devlog', column: 0, columns: 6 }]
		]);
	});
	test('nothing changes inside the 6 pixel slop', () => {
		const result = resizeByPointer(start(), 6, 6, 1200, false);
		expect(result.widthChanged).toBe(false);
		expect(result.heightChanged).toBe(false);
		expect(result.columns).toBe(6);
	});
	test('growing right pushes the neighbour and caps so it keeps 4 columns', () => {
		const result = resizeByPointer(start(), 500, 0, 1200, false);
		expect(result.columns).toBe(8);
		expect(result.sizes).toEqual([{ tile: 'elapsed', column: 8, columns: 4 }]);
		const applied = applyResize(layout, 'devlog', result);
		expect(sizeOf(applied, 'devlog')).toEqual({ column: 0, columns: 8, height: null });
		expect(sizeOf(applied, 'elapsed')).toEqual({ column: 8, columns: 4, height: null });
	});
	test('dragging back restores the neighbour exactly', () => {
		const back = resizeByPointer(start(), 0, 0, 1200, false);
		expect(back.sizes).toEqual([{ tile: 'elapsed', column: 6, columns: 6 }]);
		expect(back.widthChanged).toBe(false);
	});
	test('the left edge moves the column and keeps the right boundary', () => {
		const result = resizeByPointer(
			start({
				tile: 'elapsed',
				edge: 'left',
				startColumn: 6,
				sideNeighborRows: sideNeighborRows(layout, packing, visible, 'elapsed', 'left')
			}),
			-305,
			0,
			1200,
			false
		);
		expect(result.column).toBe(4);
		expect(result.columns).toBe(8);
		expect(result.sizes).toEqual([{ tile: 'devlog', column: 0, columns: 4 }]);
	});
	test('height snaps to 10 and a fit-content tile stays fit when dragged out of range', () => {
		expect(resizeByPointer(start({ startHeight: 300 }), 0, 104, 1200, false).height).toBe(400);
		expect(resizeByPointer(start(), 0, 50, 1200, false).height).toBeNull();
		expect(
			resizeByPointer(start({ startHeight: 300, startCustomHeight: 300 }), 0, -200, 1200, false)
				.height
		).toBe(220);
	});
	test('stacked tiles only change height', () => {
		const result = resizeByPointer(start({ startHeight: 300 }), 400, 100, 400, true);
		expect(result.columns).toBe(6);
		expect(result.height).toBe(400);
	});
	test('keyboard: arrows move the corner, shift doubles, home fits', () => {
		const size = { column: 2, columns: 6, height: null };
		expect(resizeByKey(size, 'right', 'ArrowRight', false, 300)).toEqual({ ...size, columns: 7 });
		expect(resizeByKey(size, 'right', 'ArrowRight', true, 300)).toEqual({ ...size, columns: 8 });
		expect(resizeByKey(size, 'right', 'ArrowLeft', true, 300)).toEqual({ ...size, columns: 4 });
		expect(resizeByKey(size, 'left', 'ArrowLeft', true, 300)).toEqual({
			column: 0,
			columns: 8,
			height: null
		});
		expect(resizeByKey(size, 'left', 'ArrowRight', true, 300)).toEqual({
			column: 4,
			columns: 4,
			height: null
		});
		expect(resizeByKey(size, 'right', 'ArrowDown', false, 300)?.height).toBe(310);
		expect(resizeByKey(size, 'right', 'ArrowUp', true, 300)?.height).toBe(250);
		expect(resizeByKey({ ...size, height: 500 }, 'right', 'Home', false, 300)?.height).toBeNull();
		expect(resizeByKey(size, 'right', 'Tab', false, 300)).toBeNull();
	});
	test('the height control shows the fitted height until a custom one is set', () => {
		expect(heightControlValue({ column: 0, columns: 6, height: null }, undefined)).toBe(420);
		expect(heightControlValue({ column: 0, columns: 6, height: null }, 120)).toBe(220);
		expect(heightControlValue({ column: 0, columns: 6, height: 500 }, 120)).toBe(500);
		expect(sizeOf(setTileColumns(layout, 'devlog', 3), 'devlog').columns).toBe(4);
	});
});
