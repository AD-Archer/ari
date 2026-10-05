export interface BindingDefinition {
	id: string;
	label: string;
	defaultBinding: string;
	// listed in the shortcuts dialog only while something has registered a handler for it
	optional?: boolean;
}

export type BindingOverrides = Record<string, string>;

export interface KeyLike {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}

export type KeyStorage = Pick<Storage, 'getItem' | 'setItem'>;

// the ids and defaults are what reviewers have stored under ari-keybinds: never rename one
export const bindingCatalogue: BindingDefinition[] = [
	{ id: 'next', label: 'Next submission', defaultBinding: 'j' },
	{ id: 'prev', label: 'Previous submission', defaultBinding: 'd' },
	{ id: 'wizBack', label: 'Wizard: back a step', defaultBinding: 'mod+ArrowLeft' },
	{ id: 'wizNext', label: 'Wizard: next step', defaultBinding: 'mod+ArrowRight' },
	{ id: 'decApprove', label: 'Approve', defaultBinding: 'mod+Enter' },
	{ id: 'decReject', label: 'Reject', defaultBinding: 'mod+Backspace' },
	{ id: 'decChanges', label: 'Request changes', defaultBinding: 'mod+shift+Enter' },
	{ id: 'editTime', label: 'Edit selected time', defaultBinding: ' ' },
	{ id: 'tab1', label: 'Evidence section 1', defaultBinding: '1' },
	{ id: 'tab2', label: 'Evidence section 2', defaultBinding: '2' },
	{ id: 'tab3', label: 'Evidence section 3', defaultBinding: '3' },
	{ id: 'tab4', label: 'Evidence section 4', defaultBinding: '4' },
	{ id: 'tab5', label: 'Evidence section 5', defaultBinding: '5' },
	{ id: 'tab6', label: 'Evidence section 6', defaultBinding: '6' },
	{ id: 'tab7', label: 'Evidence section 7', defaultBinding: '7' },
	{ id: 'tab8', label: 'Evidence section 8', defaultBinding: '8' },
	{ id: 'tab9', label: 'Evidence section 9', defaultBinding: '9' },
	{ id: 'tabPrev', label: 'Previous evidence section', defaultBinding: '[' },
	{ id: 'tabNext', label: 'Next evidence section', defaultBinding: ']' },
	{ id: 'note', label: 'Focus note', defaultBinding: 'n' },
	{ id: 'audit', label: 'Focus audit', defaultBinding: 'i' },
	{ id: 'repo', label: 'Open repo', defaultBinding: 'r' },
	{ id: 'demo', label: 'Open live demo', defaultBinding: 'v' },
	// the two below belong to private tiles: they keep their key so a stored override still resolves
	{ id: 'hurt', label: 'Open in the hardware review tool', defaultBinding: 'h', optional: true },
	{ id: 'aicheck', label: 'Run the private check', defaultBinding: 'c', optional: true },
	{ id: 'help', label: 'This help', defaultBinding: '?' }
];

export const keybindStorageKey = 'ari-keybinds';

const extendedTabIds = ['tab5', 'tab6', 'tab7', 'tab8', 'tab9'];

// a combo on one of these base keys can be a default but never a reviewer's choice
const reservedKeys = new Set([
	'Enter',
	'Tab',
	'Escape',
	'Backspace',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight'
]);

const structuralKeys = [
	' ',
	'Enter',
	'Home',
	'End',
	'PageUp',
	'PageDown',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight'
];

const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta'];

const foldKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

// a symbol or digit already says whether shift was down ('?' is shift+/ on one layout and a
// key of its own on another), so shift only counts with letters, space and named keys
const shiftImplied = (key: string): boolean =>
	key.length === 1 && key !== ' ' && key.toLowerCase() === key.toUpperCase();

// meta and ctrl both read as mod so one binding works on every platform
export function comboFor(event: KeyLike): string {
	const parts: string[] = [];
	if (event.metaKey || event.ctrlKey) parts.push('mod');
	if (event.shiftKey && !shiftImplied(event.key)) parts.push('shift');
	if (event.altKey) parts.push('alt');
	parts.push(foldKey(event.key));
	return parts.join('+');
}

export const isModifierKey = (key: string): boolean => modifierKeys.includes(key);

const baseKeyOf = (combo: string): string => {
	// a trailing plus is the plus key itself
	if (combo.endsWith('+')) return '+';
	return combo.split('+').pop() ?? combo;
};

// a combo stored before shift was dropped for symbols ('shift+?') still has to match
export function canonicalCombo(combo: string): string {
	const base = baseKeyOf(combo);
	if (!shiftImplied(base)) return combo;
	const modifiers = combo
		.slice(0, combo.length - base.length)
		.split('+')
		.filter((modifier) => modifier && modifier !== 'shift');
	return [...modifiers, base].join('+');
}

export const isReservedCombo = (combo: string): boolean => reservedKeys.has(baseKeyOf(combo));

const glyphs: Record<string, string> = {
	' ': 'Space',
	Enter: '↵',
	Backspace: '⌫',
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓'
};

export function prettyCombo(combo: string, mac: boolean): string {
	const base = baseKeyOf(combo);
	const modifiers = combo
		.slice(0, combo.length - base.length)
		.split('+')
		.filter(Boolean)
		.map((modifier) =>
			modifier === 'mod'
				? mac
					? '⌘'
					: 'Ctrl'
				: modifier === 'shift'
					? '⇧'
					: modifier === 'alt'
						? mac
							? '⌥'
							: 'Alt'
						: modifier
		);
	const shownBase = glyphs[base] ?? (modifiers.length ? base.toUpperCase() : base);
	if (!modifiers.length) return shownBase;
	return mac ? modifiers.join('') + shownBase : [...modifiers, shownBase].join('+');
}

const definitionOf = (definitions: BindingDefinition[], id: string) =>
	definitions.find((definition) => definition.id === id);

export function bindingOf(
	definitions: BindingDefinition[],
	overrides: BindingOverrides,
	id: string
): string {
	const stored = overrides[id];
	return canonicalCombo(
		typeof stored === 'string' ? stored : (definitionOf(definitions, id)?.defaultBinding ?? '')
	);
}

export function matchBinding(
	definitions: BindingDefinition[],
	overrides: BindingOverrides,
	combo: string
): string | null {
	for (const definition of definitions) {
		if (bindingOf(definitions, overrides, definition.id) === combo) return definition.id;
	}
	return null;
}

// taking a combo another action owns swaps the two, so no action ends up unreachable
export function rebind(
	definitions: BindingDefinition[],
	overrides: BindingOverrides,
	id: string,
	combo: string
): BindingOverrides {
	const next = { ...overrides };
	const previous = bindingOf(definitions, overrides, id);
	for (const definition of definitions) {
		if (definition.id !== id && bindingOf(definitions, overrides, definition.id) === combo)
			next[definition.id] = previous;
	}
	next[id] = combo;
	return next;
}

export function resetBinding(
	definitions: BindingDefinition[],
	overrides: BindingOverrides,
	id: string
): BindingOverrides {
	const next = { ...overrides };
	const current = bindingOf(definitions, overrides, id);
	const target = definitionOf(definitions, id)?.defaultBinding ?? '';
	for (const definition of definitions) {
		if (definition.id === id || bindingOf(definitions, overrides, definition.id) !== target)
			continue;
		if (current === definition.defaultBinding) delete next[definition.id];
		else next[definition.id] = current;
	}
	delete next[id];
	return next;
}

// tabs 5 to 9 arrived after reviewers could already bind those keys: an existing binding keeps its
// key and the colliding new tab takes the default that binding vacated
export function migrateExtendedTabs(overrides: BindingOverrides): {
	overrides: BindingOverrides;
	changed: boolean;
} {
	const next = { ...overrides };
	const occupied = new Map<string, string>();
	let changed = false;
	const stored = (id: string) => bindingOf(bindingCatalogue, next, id);

	for (const definition of bindingCatalogue) {
		if (extendedTabIds.includes(definition.id)) continue;
		const combo = stored(definition.id);
		if (!occupied.has(combo)) occupied.set(combo, definition.id);
	}

	const unresolved: string[] = [];
	for (const id of extendedTabIds) {
		const explicit = next[id];
		if (typeof explicit === 'string' && !occupied.has(explicit)) occupied.set(explicit, id);
		else unresolved.push(id);
	}

	for (const id of unresolved) {
		const desired = stored(id);
		if (!occupied.has(desired)) {
			occupied.set(desired, id);
			continue;
		}
		let owner = occupied.get(desired);
		const visited: string[] = [];
		let replacement: string | undefined;
		while (owner && !visited.includes(owner)) {
			visited.push(owner);
			const candidate = definitionOf(bindingCatalogue, owner)?.defaultBinding ?? '';
			const candidateOwner = occupied.get(candidate);
			if (!candidateOwner) {
				replacement = candidate;
				break;
			}
			owner = candidateOwner;
		}
		// a hand-edited store can leave no vacated default: fall back to any free one
		replacement ??= bindingCatalogue
			.map((definition) => definition.defaultBinding)
			.find((candidate) => !occupied.has(candidate));
		replacement ??=
			'56789abcdefghijklmnopqrstuvwxyz'
				.split('')
				.flatMap((key) => [`alt+shift+${key}`, `mod+alt+shift+${key}`])
				.find((candidate) => !occupied.has(candidate)) ?? desired;

		next[id] = replacement;
		occupied.set(replacement, id);
		changed = true;
	}
	return { overrides: next, changed };
}

export function saveOverrides(storage: KeyStorage | null, overrides: BindingOverrides): void {
	try {
		storage?.setItem(keybindStorageKey, JSON.stringify(overrides));
	} catch {
		// the bindings still work for this visit when storage is unavailable
	}
}

export function loadOverrides(storage: KeyStorage | null): BindingOverrides {
	if (!storage) return {};
	try {
		const raw: unknown = JSON.parse(storage.getItem(keybindStorageKey) || '{}');
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
		const strings: BindingOverrides = {};
		for (const [id, combo] of Object.entries(raw)) {
			if (typeof combo === 'string') strings[id] = combo;
		}
		const migrated = migrateExtendedTabs(strings);
		if (migrated.changed) saveOverrides(storage, migrated.overrides);
		return migrated.overrides;
	} catch {
		return {};
	}
}

export interface KeyContext {
	key: string;
	modified: boolean;
	typing: boolean;
	singleLine: boolean;
	// focus is on a button or a link, which enter and space activate
	onControl: boolean;
	// focus is inside a scroller that uses these keys itself
	inScrollRegion: boolean;
	dialogOpen: boolean;
}

export type KeyVerdict = 'shortcut' | 'blur' | 'ignore';

export function keyVerdict(context: KeyContext): KeyVerdict {
	if (context.key === 'Escape') {
		// an open dialog closes itself on escape
		if (context.dialogOpen) return 'ignore';
		return context.typing ? 'blur' : 'shortcut';
	}
	// a modified combo is deliberate, so it fires from inside a text field too
	if (context.modified) return 'shortcut';
	if (context.typing) return context.key === 'Enter' && context.singleLine ? 'blur' : 'ignore';
	if (context.onControl && (context.key === 'Enter' || context.key === ' ')) return 'ignore';
	if (context.inScrollRegion && structuralKeys.includes(context.key)) return 'ignore';
	return 'shortcut';
}

export interface ShortcutGate {
	allowInDialog?: boolean;
	when?: () => boolean;
}

export const shortcutAllowed = (shortcut: ShortcutGate, dialogOpen: boolean): boolean =>
	(!dialogOpen || shortcut.allowInDialog === true) && (shortcut.when?.() ?? true);
