import type { IconName } from '$lib/components/ui/iconPaths';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastItem {
	id: number;
	message: string;
	tone: ToastTone;
	icon: IconName;
	durationMs: number;
}

export interface ToastOptions {
	icon?: IconName;
	durationMs?: number;
}

const toneIcons: Record<ToastTone, IconName> = { success: 'check', info: 'info', error: 'x' };

function createToast() {
	let items = $state<ToastItem[]>([]);
	let lastId = 0;
	const timers: Record<number, ReturnType<typeof setTimeout>> = {};

	function dismiss(id: number) {
		clearTimeout(timers[id]);
		delete timers[id];
		items = items.filter((item) => item.id !== id);
	}

	function pause(id: number) {
		clearTimeout(timers[id]);
		delete timers[id];
	}

	function resume(id: number) {
		const item = items.find((candidate) => candidate.id === id);
		if (!item || id in timers) return;
		timers[id] = setTimeout(() => dismiss(id), item.durationMs);
	}

	function show(message: string, tone: ToastTone = 'success', options: ToastOptions = {}) {
		lastId += 1;
		const item: ToastItem = {
			id: lastId,
			message,
			tone,
			icon: options.icon ?? toneIcons[tone],
			// errors stay up longer so there is time to read what went wrong
			durationMs: options.durationMs ?? (tone === 'error' ? 6000 : 2600)
		};
		items = [...items, item];
		resume(item.id);
		return item.id;
	}

	return {
		get items() {
			return items;
		},
		show,
		success: (message: string, options?: ToastOptions) => show(message, 'success', options),
		info: (message: string, options?: ToastOptions) => show(message, 'info', options),
		error: (message: string, options?: ToastOptions) => show(message, 'error', options),
		dismiss,
		pause,
		resume
	};
}

export const toast = createToast();
