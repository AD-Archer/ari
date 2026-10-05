// the browser replays enter and move events at the old coordinates when content scrolls or shifts under a
// resting pointer; only a press or a change of coordinates is the person actually pointing at something
export class HoverGate {
	#x: number | null = null;
	#y: number | null = null;
	#open = false;

	get open() {
		return this.#open;
	}

	pointerAt(x: number, y: number, pressed = false) {
		if (pressed || (this.#x !== null && (x !== this.#x || y !== this.#y))) this.#open = true;
		this.#x = x;
		this.#y = y;
	}

	// a deliberate selection stands until the pointer really moves again
	hold() {
		this.#open = false;
	}
}
