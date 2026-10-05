import { untrack } from 'svelte';
import type { ReviewContext } from './reviewContext.svelte';

export interface CursorRows {
	count: () => number;
	// rows per visual line. one unless the tile lays its rows out as a grid
	columns?: () => number;
	open?: (index: number) => void;
}

export type CursorDirection = 'up' | 'down' | 'left' | 'right';

// the evidence row the keyboard is on: one tile at a time, shared by every tile body
export class EvidenceCursor {
	tile = $state<string | null>(null);
	index = $state(0);
	#rows = $state.raw<Record<string, CursorRows>>({});

	constructor(context: ReviewContext) {
		$effect.pre(() => {
			void context.ship.id;
			this.index = 0;
		});
	}

	// a tile body tells the cursor how many rows it has. returns the unregister function, so
	// call it from an effect and return the result
	registerRows(tile: string, rows: CursorRows): () => void {
		untrack(() => {
			this.#rows = { ...this.#rows, [tile]: rows };
		});
		return () => {
			untrack(() => {
				if (this.#rows[tile] !== rows) return;
				const remaining = { ...this.#rows };
				delete remaining[tile];
				this.#rows = remaining;
			});
		};
	}

	// the dock reports the tile in use. choosing one starts at its first row, hovering keeps place
	setTile(tile: string | null, options: { resetIndex?: boolean } = {}): void {
		if (tile !== this.tile || options.resetIndex) this.index = 0;
		this.tile = tile;
	}

	readonly count = $derived(this.tile ? (this.#rows[this.tile]?.count() ?? 0) : 0);

	isCurrent(tile: string, index: number): boolean {
		return this.tile === tile && this.index === index;
	}

	rowId(tile: string, index: number): string {
		return `evidence-${tile}-row-${index}`;
	}

	select(tile: string, index: number): void {
		this.tile = tile;
		this.index = index;
	}

	// up and down step a whole visual line, left and right stay inside it
	move(direction: CursorDirection): void {
		const count = this.count;
		if (!this.tile || count === 0) return;
		const columns = Math.max(1, this.#rows[this.tile]?.columns?.() ?? 1);
		let next = this.index;
		if (direction === 'down') next = Math.min(count - 1, this.index + columns);
		else if (direction === 'up') next = Math.max(0, this.index - columns);
		else if (direction === 'right') {
			if (columns === 1) next = Math.min(count - 1, this.index + 1);
			else if (this.index % columns < columns - 1 && this.index + 1 < count) next = this.index + 1;
		} else if (columns === 1) next = Math.max(0, this.index - 1);
		else if (this.index % columns > 0) next = this.index - 1;
		this.index = next;
		this.scrollIntoView();
	}

	open(): boolean {
		const rows = this.tile ? this.#rows[this.tile] : null;
		if (!rows?.open || this.index >= rows.count()) return false;
		rows.open(this.index);
		return true;
	}

	scrollIntoView(): void {
		if (!this.tile || typeof document === 'undefined') return;
		document
			.getElementById(this.rowId(this.tile, this.index))
			?.scrollIntoView({ block: 'nearest' });
	}

	// the duration input of the current row, for the edit-time shortcut. null when it has none
	currentTimeInput(): HTMLInputElement | null {
		if (!this.tile || typeof document === 'undefined') return null;
		return (
			document
				.getElementById(this.rowId(this.tile, this.index))
				?.querySelector<HTMLInputElement>('input[data-row-seconds]') ?? null
		);
	}
}
