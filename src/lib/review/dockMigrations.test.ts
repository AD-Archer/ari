import { describe, expect, test } from 'bun:test';
import { defaultDockLayout, dockTileIds, type DockLayout } from './dockDefaults';
import { groupTiles, placeTile, setCollapsed, setTileSize } from './dockLayout';
import {
	dockStorageKey,
	loadDockLayout,
	migrateFirstDockLayout,
	migrateSecondDockLayout,
	migrateThirdDockLayout,
	parseDockLayout,
	parseFirstDockLayout,
	parseSecondDockLayout,
	parseThirdDockLayout,
	serializeDockLayout
} from './dockMigrations';

const scope = { userId: 'userOne', programId: 'programOne', track: 'software' };
const storage = (entries: Record<string, unknown>) => (key: string) =>
	key in entries ? JSON.stringify(entries[key]) : null;
const half = (column: number) => ({ column, columns: 6, height: null });

describe('storage keys', () => {
	test('one key per generation, user, program and track', () => {
		expect(dockStorageKey(4, scope)).toBe(
			'ari-review-evidence-layout:v4:userOne:programOne:software'
		);
		expect(dockStorageKey(1, { ...scope, userId: null, track: 'hardware' })).toBe(
			'ari-review-evidence-layout:v1:anonymous:programOne:hardware'
		);
	});
});

describe('generation 1', () => {
	const stored = {
		version: 1,
		columns: [['pastprojects'], ['history']],
		collapsed: { history: true, pastprojects: false }
	};
	test('the two history tiles keep their swapped columns and collapse state', () => {
		const loaded = loadDockLayout(storage({ [dockStorageKey(1, scope)]: stored }), scope);
		expect(loaded.generation).toBe(1);
		expect(loaded.layout.order).toEqual([
			'commits',
			'devlog',
			'readme',
			'aicheck',
			'pastprojects',
			'elapsed',
			'hackatime',
			'files',
			'history'
		]);
		expect(loaded.layout.sizes.pastprojects).toEqual(half(0));
		expect(loaded.layout.sizes.history).toEqual(half(6));
		expect(loaded.layout.sizes.commits).toEqual({ column: 0, columns: 12, height: null });
		expect(loaded.layout.collapsed).toEqual({ history: true, pastprojects: false });
		expect(loaded.layout.groups).toEqual([]);
	});
	test('both tiles in one column', () => {
		const second = migrateFirstDockLayout(
			parseFirstDockLayout(
				JSON.stringify({ ...stored, columns: [[], ['history', 'pastprojects']] })
			)!
		);
		expect(second.columns).toEqual([
			['devlog', 'readme', 'aicheck'],
			['elapsed', 'hackatime', 'files', 'history', 'pastprojects']
		]);
		expect(second.full).toEqual(['commits']);
	});
	test('rejects other tiles, duplicates and a missing collapse flag', () => {
		const reject = (value: unknown) =>
			expect(parseFirstDockLayout(JSON.stringify(value))).toBeNull();
		reject({ ...stored, columns: [['commits'], ['history']] });
		reject({ ...stored, columns: [['history'], ['history']] });
		reject({ ...stored, collapsed: { history: true } });
		reject({ ...stored, version: 2 });
		expect(parseFirstDockLayout('not json')).toBeNull();
		expect(parseFirstDockLayout(null)).toBeNull();
	});
});

describe('generation 2', () => {
	const stored = {
		version: 2,
		full: ['commits', 'readme'],
		columns: [
			['history', 'devlog'],
			['files', 'elapsed', 'pastprojects']
		],
		collapsed: { readme: true, bogus: true, files: 'yes' }
	};
	test('full tiles become 12 columns, column tiles 6 at column 0 or 6, in reading order', () => {
		const loaded = loadDockLayout(storage({ [dockStorageKey(2, scope)]: stored }), scope);
		expect(loaded.generation).toBe(2);
		expect(loaded.layout.order).toEqual([
			'commits',
			'readme',
			'history',
			'devlog',
			'aicheck',
			'files',
			'elapsed',
			'pastprojects',
			'hackatime'
		]);
		expect(loaded.layout.sizes.readme).toEqual({ column: 0, columns: 12, height: null });
		expect(loaded.layout.sizes.history).toEqual(half(0));
		expect(loaded.layout.sizes.aicheck).toEqual(half(0));
		expect(loaded.layout.sizes.files).toEqual(half(6));
		expect(loaded.layout.sizes.hackatime).toEqual(half(6));
		expect(loaded.layout.collapsed).toEqual({ readme: true });
	});
	test('tiles the stored value never knew are appended to their default lane', () => {
		const second = parseSecondDockLayout(
			JSON.stringify({ version: 2, full: [], columns: [['history'], []], collapsed: {} })
		)!;
		expect(second.full).toEqual(['commits']);
		expect(second.columns[0]).toEqual(['history', 'devlog', 'readme', 'aicheck']);
		expect(second.columns[1]).toEqual(['elapsed', 'hackatime', 'files', 'pastprojects']);
		expect(migrateSecondDockLayout(second).order).toHaveLength(9);
	});
	test('rejects unknown tiles, duplicates and a wrong column count', () => {
		const reject = (value: unknown) =>
			expect(parseSecondDockLayout(JSON.stringify(value))).toBeNull();
		reject({ ...stored, full: ['commits', 'nope'] });
		reject({ ...stored, full: ['commits', 'history'] });
		reject({ ...stored, columns: [['history']] });
		reject({ ...stored, columns: [['history'], 'files'] });
		reject({ version: 2, columns: [[], []] });
	});
});

describe('generation 3', () => {
	const stored = {
		version: 3,
		order: ['files', 'commits', 'devlog'],
		sizes: {
			files: { column: 3, columns: 9, height: 404 },
			commits: { column: 0, columns: 2, height: null },
			devlog: { column: 9.6, columns: 6 }
		},
		collapsed: { devlog: true }
	};
	test('order is completed from the default, sizes are normalised, groups start empty', () => {
		const loaded = loadDockLayout(storage({ [dockStorageKey(3, scope)]: stored }), scope);
		expect(loaded.generation).toBe(3);
		expect(loaded.layout.version).toBe(4);
		expect(loaded.layout.order).toEqual([
			'files',
			'commits',
			'devlog',
			'readme',
			'aicheck',
			'history',
			'elapsed',
			'hackatime',
			'pastprojects'
		]);
		expect(loaded.layout.sizes.files).toEqual({ column: 3, columns: 9, height: 400 });
		expect(loaded.layout.sizes.commits).toEqual({ column: 0, columns: 4, height: null });
		expect(loaded.layout.sizes.devlog).toEqual({ column: 6, columns: 6, height: null });
		expect(loaded.layout.sizes.elapsed).toEqual(half(6));
		expect(loaded.layout.collapsed).toEqual({ devlog: true });
		expect(loaded.layout.groups).toEqual([]);
	});
	test('rejects unknown or repeated tiles', () => {
		expect(
			parseThirdDockLayout(JSON.stringify({ ...stored, order: ['files', 'files'] }))
		).toBeNull();
		expect(parseThirdDockLayout(JSON.stringify({ ...stored, order: ['unknown'] }))).toBeNull();
		expect(parseThirdDockLayout(JSON.stringify({ ...stored, version: 4 }))).toBeNull();
		expect(migrateThirdDockLayout(parseThirdDockLayout(JSON.stringify(stored))!).groups).toEqual(
			[]
		);
	});
});

describe('generation 4', () => {
	const stored = {
		version: 4,
		order: ['devlog', 'elapsed', 'commits'],
		sizes: { devlog: { column: 0, columns: 8, height: 300 } },
		collapsed: { commits: true },
		groups: [{ tiles: ['devlog', 'elapsed'], active: 'elapsed' }]
	};
	test('reads the current shape; a group without an anchor is anchored on its first tile', () => {
		const layout = parseDockLayout(JSON.stringify(stored))!;
		expect(layout.order.slice(0, 4)).toEqual(['devlog', 'elapsed', 'commits', 'readme']);
		expect(layout.sizes.devlog).toEqual({ column: 0, columns: 8, height: 300 });
		expect(layout.groups).toEqual([
			{ tiles: ['devlog', 'elapsed'], active: 'elapsed', anchor: 'devlog' }
		]);
		expect(layout.collapsed).toEqual({ commits: true });
	});
	test('rejects malformed groups, which sends the reader to older generations', () => {
		const reject = (groups: unknown) =>
			expect(parseDockLayout(JSON.stringify({ ...stored, groups }))).toBeNull();
		reject(undefined);
		reject([{ tiles: ['devlog'], active: 'devlog' }]);
		reject([{ tiles: ['devlog', 'devlog'], active: 'devlog' }]);
		reject([{ tiles: ['devlog', 'elapsed'], active: 'commits' }]);
		reject([{ tiles: ['devlog', 'elapsed'], active: 'devlog', anchor: 'commits' }]);
		reject([
			{ tiles: ['devlog', 'elapsed'], active: 'devlog' },
			{ tiles: ['elapsed', 'files'], active: 'files' }
		]);
		reject([null]);
	});
	test('the newest readable generation wins and an unreadable one falls through', () => {
		const third = { version: 3, order: ['history'], sizes: {}, collapsed: {} };
		const both = storage({
			[dockStorageKey(4, scope)]: stored,
			[dockStorageKey(3, scope)]: third
		});
		expect(loadDockLayout(both, scope).generation).toBe(4);
		const broken = storage({
			[dockStorageKey(4, scope)]: { ...stored, order: ['nope'] },
			[dockStorageKey(3, scope)]: third
		});
		const loaded = loadDockLayout(broken, scope);
		expect(loaded.generation).toBe(3);
		expect(loaded.layout.order[0]).toBe('history');
	});
	test('nothing stored, or another scope, gives the default layout', () => {
		expect(loadDockLayout(() => null, scope)).toEqual({
			layout: defaultDockLayout(),
			generation: null
		});
		const other = storage({ [dockStorageKey(4, { ...scope, track: 'hardware' })]: stored });
		expect(loadDockLayout(other, scope).generation).toBeNull();
	});
});

describe('serialise', () => {
	test('round-trips a layout with groups, custom sizes and collapse state', () => {
		const everyTile = [...dockTileIds];
		let layout: DockLayout = groupTiles(defaultDockLayout(), everyTile, 'files', 'readme')!.layout;
		layout = placeTile(layout, everyTile, 'history', 0).layout;
		layout = setTileSize(layout, 'history', { column: 2, columns: 7, height: 450 });
		layout = setCollapsed(layout, 'commits', true);
		const raw = serializeDockLayout(layout);
		expect(parseDockLayout(raw)).toEqual(layout);
		expect(serializeDockLayout(parseDockLayout(raw)!)).toBe(raw);
		expect(Object.keys(JSON.parse(raw) as object)).toEqual([
			'version',
			'order',
			'sizes',
			'collapsed',
			'groups'
		]);
	});
	test('the default layout round-trips', () => {
		expect(parseDockLayout(serializeDockLayout(defaultDockLayout()))).toEqual(defaultDockLayout());
	});
});
