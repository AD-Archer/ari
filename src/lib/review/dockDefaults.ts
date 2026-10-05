// the grid is 12 columns wide with a 20 pixel gap; a tile spans 4 to 12 columns, is 220 to 900 pixels
// tall in steps of 10, and has a 42 pixel header. saved layouts depend on these numbers, so they are
// written literally throughout the dock modules.

// saved layouts name tiles by these ids: one that is missing here makes the whole stored layout unreadable
export const dockTileIds = [
	'commits',
	'devlog',
	'elapsed',
	'readme',
	'hackatime',
	'aicheck',
	'files',
	'history',
	'pastprojects'
] as const;

export type DockTileId = (typeof dockTileIds)[number];

export interface DockTileSize {
	column: number;
	columns: number;
	height: number | null;
}

export interface DockGroup {
	tiles: DockTileId[];
	active: DockTileId;
	anchor: DockTileId;
}

export interface DockLayout {
	version: 4;
	order: DockTileId[];
	sizes: Partial<Record<DockTileId, DockTileSize>>;
	collapsed: Partial<Record<DockTileId, boolean>>;
	groups: DockGroup[];
}

export type DockColumns = [DockTileId[], DockTileId[]];

export const isDockTileId = (value: unknown): value is DockTileId =>
	typeof value === 'string' && (dockTileIds as readonly string[]).includes(value);

export const defaultFullWidthTiles = (): DockTileId[] => ['commits'];

export const defaultColumnTiles = (): DockColumns => [
	['devlog', 'readme', 'aicheck', 'history'],
	['elapsed', 'hackatime', 'files', 'pastprojects']
];

export function defaultTileSize(tile: DockTileId): DockTileSize {
	return {
		column: defaultColumnTiles()[1].includes(tile) ? 6 : 0,
		columns: defaultFullWidthTiles().includes(tile) ? 12 : 6,
		height: null
	};
}

export function defaultDockLayout(): DockLayout {
	return {
		version: 4,
		order: [...defaultFullWidthTiles(), ...defaultColumnTiles().flat()],
		sizes: Object.fromEntries(dockTileIds.map((tile) => [tile, defaultTileSize(tile)])),
		collapsed: {},
		groups: []
	};
}

export function normalizeTileSize(tile: DockTileId, value: unknown): DockTileSize {
	const fallback = defaultTileSize(tile);
	if (!value || typeof value !== 'object') return fallback;
	const candidate = value as Partial<DockTileSize>;
	const columns =
		typeof candidate.columns === 'number' && Number.isFinite(candidate.columns)
			? Math.max(4, Math.min(12, Math.round(candidate.columns)))
			: fallback.columns;
	const column =
		typeof candidate.column === 'number' && Number.isFinite(candidate.column)
			? Math.max(0, Math.min(12 - columns, Math.round(candidate.column)))
			: Math.min(fallback.column, 12 - columns);
	const height =
		candidate.height === null
			? null
			: typeof candidate.height === 'number' && Number.isFinite(candidate.height)
				? Math.max(220, Math.min(900, Math.round(candidate.height / 10) * 10))
				: fallback.height;
	return { column, columns, height };
}

export function normalizeAllSizes(
	sizes: Partial<Record<DockTileId, unknown>> | null | undefined
): Record<DockTileId, DockTileSize> {
	return Object.fromEntries(
		dockTileIds.map((tile) => [tile, normalizeTileSize(tile, sizes?.[tile])])
	) as Record<DockTileId, DockTileSize>;
}
