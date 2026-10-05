import { goto } from '$app/navigation';
import { page } from '$app/state';
import { listHref } from '$lib/shipList';

export function applyListParams(changes: Record<string, string | null>) {
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the current, already-resolved pathname
	return goto(listHref(page.url, changes), { replaceState: true, keepFocus: true, noScroll: true });
}
