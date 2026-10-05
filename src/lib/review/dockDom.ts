import type { DockTileId } from './dockDefaults';
import { isStackedWidth } from './dockGeometry';
import type { DockState } from './dockState.svelte';

type StyleVariables = Record<string, string | number | null | undefined>;

// the one place data-driven positions and sizes reach the dom: as custom properties the stylesheets read
export function styleVariables(node: HTMLElement, variables: StyleVariables) {
	let applied: string[] = [];
	const apply = (next: StyleVariables) => {
		for (const name of applied) if (!(name in next)) node.style.removeProperty(`--${name}`);
		applied = Object.keys(next);
		for (const [name, value] of Object.entries(next)) {
			if (value === null || value === undefined) node.style.removeProperty(`--${name}`);
			else node.style.setProperty(`--${name}`, String(value));
		}
	};
	apply(variables);
	return { update: apply };
}

export function measureWorkspace(node: HTMLElement, dock: DockState) {
	// the same 1100 pixel breakpoint as the css grid fallback in EvidenceDock.svelte
	const media = window.matchMedia('(max-width: 1100px)');
	const update = () => {
		const width = node.clientWidth;
		// half a pixel of change is measurement noise
		if (Math.abs(width - dock.workspaceWidth) > 0.5) dock.workspaceWidth = width;
		dock.stacked = isStackedWidth(width, media.matches);
	};
	const observer = new ResizeObserver(update);
	observer.observe(node);
	media.addEventListener('change', update);
	dock.workspace = node;
	update();
	return {
		destroy() {
			observer.disconnect();
			media.removeEventListener('change', update);
			if (dock.workspace === node) dock.workspace = null;
		}
	};
}

export function measureTile(node: HTMLElement, options: { dock: DockState; tile: DockTileId }) {
	let current = options;
	const update = () => {
		// offsetHeight ignores the drag scale and rotation, so the placeholder uses the true layout size
		const height = node.offsetHeight;
		if (height > 0) current.dock.recordHeights(current.tile, height);
	};
	const observer = new ResizeObserver(update);
	observer.observe(node);
	update();
	return {
		update(next: { dock: DockState; tile: DockTileId }) {
			current = next;
			update();
		},
		destroy() {
			observer.disconnect();
		}
	};
}

// keys and presses inside the size menu stay there, so they neither reach page shortcuts nor start a
// tile hold; escape still reaches the popover that closes it
export function containEvents(node: HTMLElement) {
	const onKey = (event: KeyboardEvent) => {
		if (event.key !== 'Escape') event.stopPropagation();
	};
	const onPress = (event: PointerEvent) => event.stopPropagation();
	node.addEventListener('keydown', onKey);
	node.addEventListener('pointerdown', onPress);
	return {
		destroy() {
			node.removeEventListener('keydown', onKey);
			node.removeEventListener('pointerdown', onPress);
		}
	};
}

export function holdToDrag(node: HTMLElement, options: { dock: DockState; tile: DockTileId }) {
	let current = options;
	const onDown = (event: PointerEvent) => current.dock.tileSession.start(current.tile, event);
	node.addEventListener('pointerdown', onDown);
	return {
		update(next: { dock: DockState; tile: DockTileId }) {
			current = next;
		},
		destroy: () => node.removeEventListener('pointerdown', onDown)
	};
}
