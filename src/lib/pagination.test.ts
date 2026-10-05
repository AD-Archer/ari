import { describe, expect, test } from 'bun:test';
import { pageCountFor, pageRange, pageWindow } from './pagination';

describe('pageWindow', () => {
	test('a single page is just that page', () => {
		expect(pageWindow(0, 1)).toEqual([0]);
		expect(pageWindow(0, 0)).toEqual([0]);
	});

	test('short lists show every page', () => {
		expect(pageWindow(1, 3)).toEqual([0, 1, 2]);
	});

	test('first page keeps its neighbour and the last page', () => {
		expect(pageWindow(0, 10)).toEqual([0, 1, '…', 9]);
	});

	test('last page keeps its neighbour and the first page', () => {
		expect(pageWindow(9, 10)).toEqual([0, '…', 8, 9]);
	});

	test('middle page has an ellipsis on both sides', () => {
		expect(pageWindow(5, 10)).toEqual([0, '…', 4, 5, 6, '…', 9]);
	});

	test('a gap of one page shows the page instead of an ellipsis', () => {
		expect(pageWindow(2, 10)).toEqual([0, 1, 2, 3, '…', 9]);
		expect(pageWindow(7, 10)).toEqual([0, '…', 6, 7, 8, 9]);
	});

	test('a wider window keeps more neighbours', () => {
		expect(pageWindow(5, 12, 2)).toEqual([0, '…', 3, 4, 5, 6, 7, '…', 11]);
	});
});

describe('pageCountFor', () => {
	test('rounds a partial page up and never returns zero', () => {
		expect(pageCountFor(0, 24)).toBe(1);
		expect(pageCountFor(24, 24)).toBe(1);
		expect(pageCountFor(25, 24)).toBe(2);
	});
});

describe('pageRange', () => {
	test('gives the one-based rows on a page', () => {
		expect(pageRange(0, 24, 60)).toEqual({ first: 1, last: 24 });
		expect(pageRange(2, 24, 60)).toEqual({ first: 49, last: 60 });
		expect(pageRange(0, 24, 0)).toEqual({ first: 0, last: 0 });
	});
});
