import { describe, expect, test } from 'bun:test';
import { clampIndex, dropIndex, moveItem } from './reorder';

describe('clampIndex', () => {
	test('keeps an index inside the list', () => {
		expect(clampIndex(-3, 4)).toBe(0);
		expect(clampIndex(2, 4)).toBe(2);
		expect(clampIndex(9, 4)).toBe(3);
		expect(clampIndex(1, 0)).toBe(0);
	});
});

describe('moveItem', () => {
	const letters = ['a', 'b', 'c', 'd'];

	test('moves an item down and up', () => {
		expect(moveItem(letters, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
		expect(moveItem(letters, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
	});

	test('clamps the target to the ends', () => {
		expect(moveItem(letters, 1, 99)).toEqual(['a', 'c', 'd', 'b']);
		expect(moveItem(letters, 2, -5)).toEqual(['c', 'a', 'b', 'd']);
	});

	test('returns an unchanged copy for a no-op or a bad source', () => {
		expect(moveItem(letters, 2, 2)).toEqual(letters);
		expect(moveItem(letters, 7, 0)).toEqual(letters);
		expect(moveItem(letters, -1, 0)).toEqual(letters);
		expect(moveItem(letters, 1, 1)).not.toBe(letters);
	});

	test('never mutates the input', () => {
		moveItem(letters, 0, 3);
		expect(letters).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('dropIndex', () => {
	const slots = [
		{ top: 0, height: 40 },
		{ top: 40, height: 40 },
		{ top: 80, height: 40 },
		{ top: 120, height: 40 }
	];

	test('stays put while the centre is inside its own slot', () => {
		expect(dropIndex(60, 1, slots)).toBe(1);
	});

	test('moves up once the centre passes a higher slot’s middle', () => {
		expect(dropIndex(19, 2, slots)).toBe(0);
		expect(dropIndex(59, 2, slots)).toBe(1);
	});

	test('moves down once the centre passes a lower slot’s middle', () => {
		expect(dropIndex(101, 0, slots)).toBe(2);
		expect(dropIndex(500, 0, slots)).toBe(3);
	});
});
