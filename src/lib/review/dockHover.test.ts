import { describe, expect, test } from 'bun:test';
import { HoverGate } from './dockHover';

describe('HoverGate', () => {
	test('the first position seen is only recorded: it may be a replay under a resting pointer', () => {
		const gate = new HoverGate();
		gate.pointerAt(800, 600);
		expect(gate.open).toBe(false);
	});
	test('a change of coordinates opens it', () => {
		const gate = new HoverGate();
		gate.pointerAt(800, 600);
		gate.pointerAt(801, 600);
		expect(gate.open).toBe(true);
	});
	test('after a selection, events replayed at the same coordinates do not reopen it', () => {
		const gate = new HoverGate();
		gate.pointerAt(10, 10);
		gate.pointerAt(800, 600);
		gate.hold();
		gate.pointerAt(800, 600);
		gate.pointerAt(800, 600);
		expect(gate.open).toBe(false);
		gate.pointerAt(800, 603);
		expect(gate.open).toBe(true);
	});
	test('a press counts as pointing even without movement', () => {
		const gate = new HoverGate();
		gate.pointerAt(800, 600);
		gate.hold();
		gate.pointerAt(800, 600, true);
		expect(gate.open).toBe(true);
	});
});
