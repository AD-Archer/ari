import { onMount, tick } from 'svelte';

const collapsedKey = 'ari-review-sidebar-collapsed';
const widthKey = 'ari-review-sidebar-width';

// 260 to 560 pixels: narrower hides the note fields, wider starves the evidence
const clampWidth = (width: number): number => Math.min(560, Math.max(260, Math.round(width)));

// the rail's width and whether it is shown. dragging its left edge resizes it, dragging well
// past the minimum hides it, and the bubble at the screen edge brings it back
export class RailSize {
	collapsed = $state(false);
	width = $state<number | null>(null);
	hidePending = $state(false);
	resizing = $state(false);

	#pointer: { id: number; startX: number; startWidth: number } | null = null;
	#host: HTMLElement | null = null;

	constructor() {
		onMount(() => {
			try {
				this.collapsed = localStorage.getItem(collapsedKey) === '1';
				const stored = Number(localStorage.getItem(widthKey));
				if (Number.isFinite(stored) && stored > 0) this.width = clampWidth(stored);
			} catch {
				// the rail stays open at its default width when storage is unavailable
			}
			const cancel = () => this.#finish();
			const onVisibility = () => {
				if (document.visibilityState !== 'visible') this.#finish();
			};
			window.addEventListener('blur', cancel);
			document.addEventListener('visibilitychange', onVisibility);
			return () => {
				window.removeEventListener('blur', cancel);
				document.removeEventListener('visibilitychange', onVisibility);
				this.#finish();
			};
		});
	}

	// 320: the width the page's css gives a rail nobody resized
	readonly currentWidth = $derived(this.width ?? 320);

	#setCollapsed(collapsed: boolean) {
		this.collapsed = collapsed;
		try {
			localStorage.setItem(collapsedKey, collapsed ? '1' : '0');
		} catch {
			// the choice lasts for this visit only
		}
	}

	#persistWidth() {
		try {
			if (this.width === null) localStorage.removeItem(widthKey);
			else localStorage.setItem(widthKey, String(this.width));
		} catch {
			// the width lasts for this visit only
		}
	}

	async hide(moveFocus = false): Promise<void> {
		this.#setCollapsed(true);
		if (!moveFocus) return;
		await tick();
		document.querySelector<HTMLElement>('[data-rail-bubble]')?.focus();
	}

	async show(): Promise<void> {
		this.#setCollapsed(false);
		await tick();
		document.querySelector<HTMLElement>('[data-rail-handle]')?.focus();
	}

	readonly startResize = (event: PointerEvent): void => {
		if (!event.isPrimary || event.button !== 0) return;
		event.preventDefault();
		this.#finish();
		const handle = event.currentTarget as HTMLElement;
		const rail = handle.closest<HTMLElement>('[data-review-rail]');
		if (!rail) return;
		this.#pointer = {
			id: event.pointerId,
			startX: event.clientX,
			startWidth: rail.getBoundingClientRect().width
		};
		this.#host = handle;
		try {
			handle.setPointerCapture(event.pointerId);
		} catch {
			this.#pointer = null;
			this.#host = null;
			return;
		}
		this.resizing = true;
		window.addEventListener('pointermove', this.#move, { passive: false });
		window.addEventListener('pointerup', this.#release);
		window.addEventListener('pointercancel', this.#cancel);
	};

	readonly lostCapture = (event: PointerEvent): void => {
		if (event.pointerId === this.#pointer?.id) this.#finish();
	};

	readonly #move = (event: PointerEvent): void => {
		const pointer = this.#pointer;
		if (!pointer || event.pointerId !== pointer.id) return;
		event.preventDefault();
		const raw = pointer.startWidth + (pointer.startX - event.clientX);
		this.width = clampWidth(raw);
		// 190: 70 pixels of slack below the 260 minimum before a release hides the rail
		this.hidePending = raw < 190;
	};

	readonly #release = (event: PointerEvent): void => {
		if (event.pointerId !== this.#pointer?.id) return;
		const hide = this.hidePending;
		this.#finish();
		if (hide) void this.hide(true);
		else this.#persistWidth();
	};

	readonly #cancel = (event: PointerEvent): void => {
		if (event.pointerId === this.#pointer?.id) this.#finish();
	};

	#finish(): void {
		const pointer = this.#pointer;
		const host = this.#host;
		this.#pointer = null;
		this.#host = null;
		this.hidePending = false;
		this.resizing = false;
		if (pointer && host) {
			try {
				host.releasePointerCapture(pointer.id);
			} catch {
				// the capture is already gone
			}
		}
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', this.#move);
		window.removeEventListener('pointerup', this.#release);
		window.removeEventListener('pointercancel', this.#cancel);
	}

	readonly resizeWithKey = (event: KeyboardEvent): void => {
		if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'Home') {
			this.width = null;
			this.#persistWidth();
			return;
		}
		const step = event.shiftKey ? 48 : 16; // pixels per press
		if (event.key === 'ArrowLeft') {
			this.width = clampWidth(this.currentWidth + step);
		} else {
			const next = this.currentWidth - step;
			// 260 is the minimum width: going below it hides the rail
			if (next < 260) {
				void this.hide(true);
				return;
			}
			this.width = clampWidth(next);
		}
		this.#persistWidth();
	};
}

export function railWidth(node: HTMLElement, width: number | null) {
	const apply = (next: number | null) => {
		if (next === null) node.style.removeProperty('--review-rail-width');
		else node.style.setProperty('--review-rail-width', `${next}px`);
	};
	apply(width);
	return { update: apply };
}
