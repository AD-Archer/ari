import { describe, expect, test } from 'bun:test';
import {
	bindingCatalogue,
	bindingOf,
	canonicalCombo,
	comboFor,
	isReservedCombo,
	keybindStorageKey,
	keyVerdict,
	loadOverrides,
	matchBinding,
	prettyCombo,
	rebind,
	resetBinding,
	saveOverrides,
	shortcutAllowed,
	type KeyContext
} from './keybindRules';

const keyEvent = (
	key: string,
	modifiers: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', true>>
) => ({
	key,
	metaKey: modifiers.meta === true,
	ctrlKey: modifiers.ctrl === true,
	shiftKey: modifiers.shift === true,
	altKey: modifiers.alt === true
});

function memoryStorage(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

const context = (overrides: Partial<KeyContext>): KeyContext => ({
	key: 'j',
	modified: false,
	typing: false,
	singleLine: false,
	onControl: false,
	inScrollRegion: false,
	dialogOpen: false,
	...overrides
});

describe('matcher', () => {
	test('meta and ctrl both read as mod, modifiers keep a fixed order', () => {
		expect(comboFor(keyEvent('Enter', { meta: true }))).toBe('mod+Enter');
		expect(comboFor(keyEvent('Enter', { ctrl: true, shift: true }))).toBe('mod+shift+Enter');
		expect(comboFor(keyEvent('K', { alt: true, shift: true }))).toBe('shift+alt+k');
	});

	test('a shifted symbol matches its character binding', () => {
		expect(comboFor(keyEvent('?', { shift: true }))).toBe('?');
		expect(matchBinding(bindingCatalogue, {}, comboFor(keyEvent('?', { shift: true })))).toBe(
			'help'
		);
		// layouts where the character sits on its own key, or where digits need shift
		expect(matchBinding(bindingCatalogue, {}, comboFor(keyEvent('?', {})))).toBe('help');
		expect(matchBinding(bindingCatalogue, {}, comboFor(keyEvent('1', { shift: true })))).toBe(
			'tab1'
		);
		expect(comboFor(keyEvent('!', { shift: true, meta: true }))).toBe('mod+!');
	});

	test('shift still counts with letters, space and named keys', () => {
		expect(comboFor(keyEvent('K', { shift: true }))).toBe('shift+k');
		expect(comboFor(keyEvent(' ', { shift: true }))).toBe('shift+ ');
		expect(comboFor(keyEvent('Enter', { meta: true, shift: true }))).toBe('mod+shift+Enter');
		expect(
			matchBinding(bindingCatalogue, {}, comboFor(keyEvent('Enter', { meta: true, shift: true })))
		).toBe('decChanges');
		expect(matchBinding(bindingCatalogue, {}, comboFor(keyEvent('J', { shift: true })))).toBeNull();
		expect(matchBinding(bindingCatalogue, {}, comboFor(keyEvent(' ', { shift: true })))).toBeNull();
	});

	test('a customisation stored with shift on a symbol keeps working', () => {
		expect(canonicalCombo('shift+?')).toBe('?');
		expect(canonicalCombo('mod+shift+!')).toBe('mod+!');
		expect(canonicalCombo('mod+shift++')).toBe('mod++');
		expect(canonicalCombo('shift+k')).toBe('shift+k');
		expect(canonicalCombo('mod+shift+Enter')).toBe('mod+shift+Enter');
		expect(canonicalCombo('shift+ ')).toBe('shift+ ');
		const stored = { note: 'shift+!', audit: 'shift+k' };
		expect(bindingOf(bindingCatalogue, stored, 'note')).toBe('!');
		expect(matchBinding(bindingCatalogue, stored, comboFor(keyEvent('!', { shift: true })))).toBe(
			'note'
		);
		expect(matchBinding(bindingCatalogue, stored, comboFor(keyEvent('K', { shift: true })))).toBe(
			'audit'
		);
	});

	test('single characters fold case, named keys do not', () => {
		expect(comboFor(keyEvent('J', {}))).toBe('j');
		expect(comboFor(keyEvent('ArrowLeft', {}))).toBe('ArrowLeft');
	});

	test('the defaults resolve to their actions', () => {
		expect(matchBinding(bindingCatalogue, {}, 'j')).toBe('next');
		expect(matchBinding(bindingCatalogue, {}, 'mod+Enter')).toBe('decApprove');
		expect(matchBinding(bindingCatalogue, {}, 'mod+shift+Enter')).toBe('decChanges');
		expect(matchBinding(bindingCatalogue, {}, ' ')).toBe('editTime');
		expect(matchBinding(bindingCatalogue, {}, 'q')).toBeNull();
	});

	test('an override replaces the default', () => {
		const overrides = { next: 'k' };
		expect(matchBinding(bindingCatalogue, overrides, 'k')).toBe('next');
		expect(matchBinding(bindingCatalogue, overrides, 'j')).toBeNull();
	});

	test('reserved base keys cannot be chosen, with or without modifiers', () => {
		expect(isReservedCombo('Enter')).toBe(true);
		expect(isReservedCombo('mod+Backspace')).toBe(true);
		expect(isReservedCombo('mod+k')).toBe(false);
		expect(isReservedCombo('shift++')).toBe(false);
	});

	test('labels', () => {
		expect(prettyCombo('mod+shift+Enter', true)).toBe('⌘⇧↵');
		expect(prettyCombo('mod+shift+Enter', false)).toBe('Ctrl+⇧+↵');
		expect(prettyCombo('mod+k', false)).toBe('Ctrl+K');
		expect(prettyCombo(' ', false)).toBe('Space');
		expect(prettyCombo('j', true)).toBe('j');
	});
});

describe('typing guard', () => {
	test('a plain key in a text field is left to the field', () => {
		expect(keyVerdict(context({ typing: true }))).toBe('ignore');
		expect(keyVerdict(context({ typing: true, key: ' ' }))).toBe('ignore');
	});

	test('a modified combo fires from inside a text field', () => {
		expect(keyVerdict(context({ typing: true, modified: true, key: 'Enter' }))).toBe('shortcut');
	});

	test('enter leaves a single-line input and stays a newline in a textarea', () => {
		expect(keyVerdict(context({ typing: true, singleLine: true, key: 'Enter' }))).toBe('blur');
		expect(keyVerdict(context({ typing: true, singleLine: false, key: 'Enter' }))).toBe('ignore');
	});

	test('escape blurs a field unless a dialog is open', () => {
		expect(keyVerdict(context({ typing: true, key: 'Escape' }))).toBe('blur');
		expect(keyVerdict(context({ typing: true, key: 'Escape', dialogOpen: true }))).toBe('ignore');
		expect(keyVerdict(context({ key: 'Escape' }))).toBe('shortcut');
	});

	test('enter and space belong to a focused button or link', () => {
		expect(keyVerdict(context({ onControl: true, key: 'Enter' }))).toBe('ignore');
		expect(keyVerdict(context({ onControl: true, key: ' ' }))).toBe('ignore');
		expect(keyVerdict(context({ onControl: true, key: 'j' }))).toBe('shortcut');
		expect(keyVerdict(context({ onControl: true, key: 'ArrowDown' }))).toBe('shortcut');
		expect(keyVerdict(context({ onControl: true, modified: true, key: 'Enter' }))).toBe('shortcut');
	});

	test('a scroll region keeps its own navigation keys', () => {
		expect(keyVerdict(context({ inScrollRegion: true, key: 'ArrowDown' }))).toBe('ignore');
		expect(keyVerdict(context({ inScrollRegion: true, key: 'j' }))).toBe('shortcut');
	});

	test('an open dialog only lets through the shortcuts that asked for it', () => {
		expect(shortcutAllowed({}, true)).toBe(false);
		expect(shortcutAllowed({ allowInDialog: true }, true)).toBe(true);
		expect(shortcutAllowed({}, false)).toBe(true);
		expect(shortcutAllowed({ when: () => false }, false)).toBe(false);
	});
});

describe('customisation', () => {
	test('binding a taken combo swaps the two actions', () => {
		const overrides = rebind(bindingCatalogue, {}, 'next', 'd');
		expect(bindingOf(bindingCatalogue, overrides, 'next')).toBe('d');
		expect(bindingOf(bindingCatalogue, overrides, 'prev')).toBe('j');
	});

	test('reset returns the default and hands the displaced action its own back', () => {
		const swapped = rebind(bindingCatalogue, {}, 'next', 'd');
		expect(resetBinding(bindingCatalogue, swapped, 'next')).toEqual({});
	});

	test('overrides persist under the old key and shape', () => {
		const storage = memoryStorage();
		saveOverrides(storage, rebind(bindingCatalogue, {}, 'note', 'm'));
		expect(JSON.parse(storage.values.get(keybindStorageKey) ?? '')).toEqual({ note: 'm' });
		expect(keybindStorageKey).toBe('ari-keybinds');
		expect(loadOverrides(storage)).toEqual({ note: 'm' });
	});

	test('a store written before tabs 5 to 9 existed keeps its binding and moves the tab', () => {
		const storage = memoryStorage({ [keybindStorageKey]: JSON.stringify({ note: '5' }) });
		const overrides = loadOverrides(storage);
		expect(bindingOf(bindingCatalogue, overrides, 'note')).toBe('5');
		expect(bindingOf(bindingCatalogue, overrides, 'tab5')).toBe('n');
		expect(JSON.parse(storage.values.get(keybindStorageKey) ?? '')).toEqual({
			note: '5',
			tab5: 'n'
		});
	});

	test('a corrupt store reads as no customisation', () => {
		expect(loadOverrides(memoryStorage({ [keybindStorageKey]: '{not json' }))).toEqual({});
		expect(loadOverrides(memoryStorage({ [keybindStorageKey]: '[1,2]' }))).toEqual({});
		expect(loadOverrides(null)).toEqual({});
	});
});
