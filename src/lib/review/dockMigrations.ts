import {
	defaultColumnTiles,
	defaultDockLayout,
	defaultFullWidthTiles,
	dockTileIds,
	isDockTileId,
	normalizeAllSizes,
	type DockColumns,
	type DockGroup,
	type DockLayout,
	type DockTileId,
	type DockTileSize
} from './dockDefaults';

export interface ThirdDockLayout {
	version: 3;
	order: DockTileId[];
	sizes: Partial<Record<DockTileId, DockTileSize>>;
	collapsed: Partial<Record<DockTileId, boolean>>;
}

export interface SecondDockLayout {
	version: 2;
	full: DockTileId[];
	columns: DockColumns;
	collapsed: Partial<Record<DockTileId, boolean>>;
}

// in generation 1 only the two history tiles could swap columns
export interface FirstDockLayout {
	version: 1;
	columns: [DockTileId[], DockTileId[]];
	collapsed: Partial<Record<DockTileId, boolean>>;
}

export interface DockScope {
	userId: string | null | undefined;
	programId: string;
	track: string;
}

export const dockStorageKey = (generation: 1 | 2 | 3 | 4, scope: DockScope) =>
	`ari-review-evidence-layout:v${generation}:${scope.userId ?? 'anonymous'}:${scope.programId}:${scope.track}`;

function parseObject(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const candidate: unknown = JSON.parse(raw);
		return candidate && typeof candidate === 'object'
			? (candidate as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

const isTileList = (value: unknown[]): value is DockTileId[] =>
	value.length <= dockTileIds.length &&
	value.every((tile) => isDockTileId(tile)) &&
	new Set(value).size === value.length;

function parseCollapsed(value: unknown): Partial<Record<DockTileId, boolean>> {
	const collapsed: Partial<Record<DockTileId, boolean>> = {};
	if (!value || typeof value !== 'object') return collapsed;
	const stored = value as Record<string, unknown>;
	for (const tile of dockTileIds) {
		const flag = stored[tile];
		if (typeof flag === 'boolean') collapsed[tile] = flag;
	}
	return collapsed;
}

const completeOrder = (order: DockTileId[]): DockTileId[] => [
	...order,
	...defaultDockLayout().order.filter((tile) => !order.includes(tile))
];

function parseGroups(value: unknown): DockGroup[] | null {
	if (!Array.isArray(value)) return null;
	const claimed: DockTileId[] = [];
	const groups: DockGroup[] = [];
	for (const candidate of value as unknown[]) {
		if (!candidate || typeof candidate !== 'object') return null;
		const group = candidate as Record<string, unknown>;
		if (
			!Array.isArray(group.tiles) ||
			group.tiles.length < 2 ||
			!group.tiles.every((tile) => isDockTileId(tile)) ||
			new Set(group.tiles).size !== group.tiles.length
		) {
			return null;
		}
		const tiles = [...(group.tiles as DockTileId[])];
		if (
			tiles.some((tile) => claimed.includes(tile)) ||
			!isDockTileId(group.active) ||
			!tiles.includes(group.active)
		) {
			return null;
		}
		claimed.push(...tiles);
		if (group.anchor !== undefined && !isDockTileId(group.anchor)) return null;
		const anchor = (group.anchor as DockTileId | undefined) ?? tiles[0];
		if (!tiles.includes(anchor)) return null;
		groups.push({ tiles, active: group.active, anchor });
	}
	return groups;
}

export function parseDockLayout(raw: string | null): DockLayout | null {
	const value = parseObject(raw);
	if (!value || value.version !== 4 || !Array.isArray(value.order)) return null;
	if (!isTileList(value.order)) return null;
	const groups = parseGroups(value.groups);
	if (!groups) return null;
	return {
		version: 4,
		order: completeOrder(value.order),
		sizes: normalizeAllSizes(value.sizes as Record<string, unknown> | undefined),
		collapsed: parseCollapsed(value.collapsed),
		groups
	};
}

export function parseThirdDockLayout(raw: string | null): ThirdDockLayout | null {
	const value = parseObject(raw);
	if (!value || value.version !== 3 || !Array.isArray(value.order)) return null;
	if (!isTileList(value.order)) return null;
	return {
		version: 3,
		order: completeOrder(value.order),
		sizes: normalizeAllSizes(value.sizes as Record<string, unknown> | undefined),
		collapsed: parseCollapsed(value.collapsed)
	};
}

export function parseSecondDockLayout(raw: string | null): SecondDockLayout | null {
	const value = parseObject(raw);
	if (!value || value.version !== 2) return null;
	if (!Array.isArray(value.full) || !Array.isArray(value.columns)) return null;
	const stored = value.columns as unknown[];
	if (stored.length !== 2 || !stored.every((column) => Array.isArray(column))) return null;
	const flattened = [...(value.full as unknown[]), ...(stored as unknown[][]).flat()];
	if (!isTileList(flattened)) return null;
	const full = [...(value.full as DockTileId[])];
	const columns: DockColumns = [[...(stored[0] as DockTileId[])], [...(stored[1] as DockTileId[])]];
	for (const tile of dockTileIds.filter((candidate) => !flattened.includes(candidate))) {
		if (defaultFullWidthTiles().includes(tile)) full.push(tile);
		else if (defaultColumnTiles()[0].includes(tile)) columns[0].push(tile);
		else columns[1].push(tile);
	}
	return { version: 2, full, columns, collapsed: parseCollapsed(value.collapsed) };
}

export function parseFirstDockLayout(raw: string | null): FirstDockLayout | null {
	const value = parseObject(raw);
	if (!value || value.version !== 1) return null;
	if (!Array.isArray(value.columns) || value.columns.length !== 2) return null;
	const flattened = (value.columns as unknown[]).flat();
	const collapsed = value.collapsed as Record<string, unknown> | null | undefined;
	if (
		flattened.length !== 2 ||
		!flattened.every((tile) => tile === 'history' || tile === 'pastprojects') ||
		new Set(flattened).size !== 2 ||
		typeof collapsed?.history !== 'boolean' ||
		typeof collapsed?.pastprojects !== 'boolean'
	) {
		return null;
	}
	return {
		version: 1,
		columns: value.columns as [DockTileId[], DockTileId[]],
		collapsed: collapsed as Partial<Record<DockTileId, boolean>>
	};
}

export function migrateFirstDockLayout(first: FirstDockLayout): SecondDockLayout {
	const columns = defaultColumnTiles().map((column) =>
		column.filter((tile) => tile !== 'history' && tile !== 'pastprojects')
	) as DockColumns;
	first.columns.forEach((column, index) => columns[index].push(...[column].flat()));
	return {
		version: 2,
		full: defaultFullWidthTiles(),
		columns,
		collapsed: { ...first.collapsed }
	};
}

export function migrateSecondDockLayout(second: SecondDockLayout): ThirdDockLayout {
	const sizes: Partial<Record<DockTileId, DockTileSize>> = {};
	for (const tile of dockTileIds) {
		sizes[tile] = {
			column: second.columns[1].includes(tile) ? 6 : 0,
			columns: second.full.includes(tile) ? 12 : 6,
			height: null
		};
	}
	return {
		version: 3,
		order: [...second.full, ...second.columns.flat()],
		sizes,
		collapsed: { ...second.collapsed }
	};
}

export function migrateThirdDockLayout(third: ThirdDockLayout): DockLayout {
	return {
		version: 4,
		order: [...third.order],
		sizes: normalizeAllSizes(third.sizes),
		collapsed: { ...third.collapsed },
		groups: []
	};
}

export interface LoadedDockLayout {
	layout: DockLayout;
	generation: 1 | 2 | 3 | 4 | null;
}

// older keys are left in place, as they always were
export function loadDockLayout(
	read: (key: string) => string | null,
	scope: DockScope
): LoadedDockLayout {
	const current = parseDockLayout(read(dockStorageKey(4, scope)));
	if (current) return { layout: current, generation: 4 };
	const third = parseThirdDockLayout(read(dockStorageKey(3, scope)));
	if (third) return { layout: migrateThirdDockLayout(third), generation: 3 };
	const second = parseSecondDockLayout(read(dockStorageKey(2, scope)));
	if (second) {
		return { layout: migrateThirdDockLayout(migrateSecondDockLayout(second)), generation: 2 };
	}
	const first = parseFirstDockLayout(read(dockStorageKey(1, scope)));
	if (first) {
		return {
			layout: migrateThirdDockLayout(migrateSecondDockLayout(migrateFirstDockLayout(first))),
			generation: 1
		};
	}
	return { layout: defaultDockLayout(), generation: null };
}

export function serializeDockLayout(layout: DockLayout): string {
	return JSON.stringify({
		version: 4,
		order: [...layout.order],
		sizes: normalizeAllSizes(layout.sizes),
		collapsed: { ...layout.collapsed },
		groups: layout.groups.map((group) => ({
			tiles: [...group.tiles],
			active: group.active,
			anchor: group.anchor
		}))
	});
}
