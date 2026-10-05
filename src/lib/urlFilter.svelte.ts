import { page } from '$app/state';
import { replaceState } from '$app/navigation';

// the reactive source of truth is local state seeded from the url and written back on change:
// replaceState updates the address bar without re-triggering $app/state reactivity
function setParam(key: string, value: string | null) {
	// page.url does not follow replaceState, so the address bar is the only current copy
	const entries = [...new URLSearchParams(location.search)].filter(([name]) => name !== key);
	if (value !== null && value !== '') entries.push([key, value]);
	const queryString = new URLSearchParams(entries).toString();
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current pathname is already resolved
	replaceState(queryString ? `${page.url.pathname}?${queryString}` : page.url.pathname, page.state);
}

interface Box<Value> {
	value: Value;
}

// absent or equal to the default means no param
export function strParam<Value extends string>(key: string, defaultValue: Value): Box<Value> {
	let current = $state<Value>((page.url.searchParams.get(key) as Value | null) ?? defaultValue);
	return {
		get value(): Value {
			return current;
		},
		set value(next: Value) {
			current = next;
			setParam(key, next === defaultValue ? null : next);
		}
	};
}

// comma-joined: ?key=a,b,c
export function listParam(key: string): Box<string[]> {
	const raw = page.url.searchParams.get(key);
	let current = $state<string[]>(raw ? raw.split(',').filter(Boolean) : []);
	return {
		get value(): string[] {
			return current;
		},
		set value(next: string[]) {
			current = next;
			setParam(key, next.length ? next.join(',') : null);
		}
	};
}

export function intParam(key: string, defaultValue: number | null = null): Box<number | null> {
	const seed = () => {
		const raw = page.url.searchParams.get(key);
		if (raw === null) return defaultValue;
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : defaultValue;
	};
	let current = $state<number | null>(seed());
	return {
		get value(): number | null {
			return current;
		},
		set value(next: number | null) {
			current = next;
			setParam(key, next === defaultValue || next === null ? null : String(next));
		}
	};
}
