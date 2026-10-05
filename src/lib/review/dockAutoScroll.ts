import { autoScrollVelocity } from './dockGeometry';

function scrollHost(workspace: HTMLElement | null): HTMLElement | null {
	for (let node = workspace?.parentElement; node; node = node.parentElement) {
		if (node === document.body || node === document.documentElement) return null;
		if (
			node.scrollHeight > node.clientHeight + 1 &&
			/(auto|scroll)/.test(getComputedStyle(node).overflowY)
		) {
			return node;
		}
	}
	return null;
}

// scrolls the nearest scrolling ancestor (or the window) when the pointer is near its edge; true if it moved
export function autoScrollStep(workspace: HTMLElement | null, pointerY: number) {
	const host = scrollHost(workspace);
	const bounds = host?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
	const velocity = autoScrollVelocity(pointerY, bounds.top, bounds.bottom);
	// under a tenth of a pixel nothing is scrolling
	if (Math.abs(velocity) <= 0.1) return false;
	const before = host ? host.scrollTop : window.scrollY;
	if (host) host.scrollTop += velocity;
	else window.scrollBy(0, velocity);
	const after = host ? host.scrollTop : window.scrollY;
	return Math.abs(after - before) > 0.1;
}
