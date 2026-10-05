import { untrack } from 'svelte';
import { browser } from '$app/environment';
import { toast } from '$lib/toast.svelte';
import {
	bindingCatalogue,
	bindingOf,
	comboFor,
	isModifierKey,
	isReservedCombo,
	keyVerdict,
	loadOverrides,
	prettyCombo,
	rebind,
	resetBinding,
	saveOverrides,
	shortcutAllowed,
	type BindingDefinition,
	type BindingOverrides
} from './keybindRules';

export interface Shortcut {
	// a catalogue id (next, prev, decApprove, tab1, ...) keeps the reviewer's stored binding
	id: string;
	label: string;
	defaultBinding: string;
	// return false to say the key was not used: the browser then handles it as usual
	handler: (event: KeyboardEvent) => void | boolean;
	when?: () => boolean;
	// structural keys (arrows, enter) that reviewers cannot rebind
	fixed?: boolean;
	// fires even while a dialog is open
	allowInDialog?: boolean;
}

interface Registered extends Shortcut {
	scope: string;
}

export interface ShortcutRow {
	id: string;
	label: string;
	scope: string | null;
	binding: string;
	keys: string;
	custom: boolean;
	// something on screen handles it right now
	active: boolean;
}

const storage = (): Storage | null => {
	try {
		return browser ? window.localStorage : null;
	} catch {
		return null;
	}
};

// components register the shortcuts they own. the page forwards window keydown to handleKey
export class ReviewKeybinds {
	helpOpen = $state(false);
	// set while the dialog waits for the next key press to rebind this action
	capturing = $state<string | null>(null);

	#overrides = $state.raw<BindingOverrides>({});
	#registered = $state.raw<Registered[]>([]);
	#mac = $state(false);

	constructor() {
		// read after hydration, so the server render and the first client render show the same keys
		$effect(() => {
			untrack(() => {
				this.#overrides = loadOverrides(storage());
				this.#mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
			});
		});
	}

	// call from an effect and return the result, so the shortcuts leave with the component
	registerShortcuts(scope: string, shortcuts: Shortcut[]): () => void {
		const entries = shortcuts.map((shortcut) => ({ ...shortcut, scope }));
		untrack(() => {
			this.#registered = [...this.#registered, ...entries];
		});
		return () => {
			untrack(() => {
				this.#registered = this.#registered.filter((entry) => !entries.includes(entry));
			});
		};
	}

	// the catalogue first, in its fixed order, then anything registered under a new id
	readonly #definitions: BindingDefinition[] = $derived.by(() => {
		const known = bindingCatalogue.map((definition) => definition.id);
		const extra: BindingDefinition[] = [];
		for (const entry of this.#registered) {
			if (entry.fixed || known.includes(entry.id)) continue;
			known.push(entry.id);
			extra.push({ id: entry.id, label: entry.label, defaultBinding: entry.defaultBinding });
		}
		return [...bindingCatalogue, ...extra];
	});

	binding(id: string): string {
		return bindingOf(this.#definitions, this.#overrides, id);
	}

	// the keys as shown on a button: ⌘↵, Ctrl+K, Space
	label(id: string): string {
		return prettyCombo(this.binding(id), this.#mac);
	}

	title(id: string, actionLabel?: string): string {
		const action =
			actionLabel ??
			this.#definitions.find((definition) => definition.id === id)?.label ??
			'Keyboard';
		return `${action} shortcut: ${this.label(id)}`;
	}

	isCustom(id: string): boolean {
		return id in this.#overrides;
	}

	readonly rows: ShortcutRow[] = $derived(
		this.#definitions
			.filter(
				(definition) =>
					!definition.optional || this.#registered.some((entry) => entry.id === definition.id)
			)
			.map((definition) => {
				const owner = this.#registered.find((entry) => entry.id === definition.id);
				const binding = bindingOf(this.#definitions, this.#overrides, definition.id);
				return {
					id: definition.id,
					label: owner?.label ?? definition.label,
					scope: owner?.scope ?? null,
					binding,
					keys: prettyCombo(binding, this.#mac),
					custom: definition.id in this.#overrides,
					active: Boolean(owner)
				};
			})
	);

	// the unrebindable keys in use, for the dialog's reference list
	readonly fixedRows = $derived(
		this.#registered
			.filter((entry) => entry.fixed)
			.map((entry) => ({
				id: entry.id,
				label: entry.label,
				scope: entry.scope,
				keys: prettyCombo(entry.defaultBinding, this.#mac)
			}))
	);

	#commit(overrides: BindingOverrides) {
		this.#overrides = overrides;
		saveOverrides(storage(), overrides);
	}

	set(id: string, combo: string): boolean {
		if (isReservedCombo(combo)) return false;
		this.#commit(rebind(this.#definitions, this.#overrides, id, combo));
		return true;
	}

	reset(id: string): void {
		this.#commit(resetBinding(this.#definitions, this.#overrides, id));
	}

	resetAll(): void {
		this.#commit({});
	}

	// the next key press becomes this action's binding. escape cancels
	capture(id: string | null): void {
		this.capturing = id;
	}

	closeHelp(): void {
		this.helpOpen = false;
		this.capturing = null;
	}

	#capture(event: KeyboardEvent, id: string): void {
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'Escape') {
			this.capturing = null;
			return;
		}
		// wait for the real key, so a modifier can be held first
		if (isModifierKey(event.key)) return;
		if (!this.set(id, comboFor(event))) {
			toast.error(`${event.key} is reserved`);
			return;
		}
		this.capturing = null;
	}

	readonly handleKey = (event: KeyboardEvent): void => {
		if (this.capturing) return this.#capture(event, this.capturing);
		if (event.defaultPrevented) return;

		const target = event.target instanceof HTMLElement ? event.target : null;
		const typing =
			target !== null &&
			(target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable);
		const dialogOpen = document.querySelector('dialog[open]') !== null;
		const verdict = keyVerdict({
			key: event.key,
			modified: event.metaKey || event.ctrlKey,
			typing,
			singleLine: target?.tagName === 'INPUT',
			onControl: Boolean(target?.closest('button, a[href], summary, [role="button"]')),
			inScrollRegion: Boolean(target?.closest('[data-evidence-scroll-region]')),
			dialogOpen
		});
		if (verdict === 'ignore') return;
		if (verdict === 'blur') {
			if (event.key === 'Enter') event.preventDefault();
			target?.blur();
			return;
		}

		const combo = comboFor(event);
		for (const shortcut of this.#registered) {
			const bound = shortcut.fixed ? shortcut.defaultBinding : this.binding(shortcut.id);
			if (bound !== combo || !shortcutAllowed(shortcut, dialogOpen)) continue;
			if (shortcut.handler(event) === false) continue;
			event.preventDefault();
			return;
		}
	};
}
