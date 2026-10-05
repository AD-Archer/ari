import type { DecisionDraft } from '$lib/review/reviewTypes';
import { serializeStoredDraft } from './draftSeed';

export interface AutosaveTarget {
	storageKey: string;
	// absolute, so a save scheduled on one ship can never post to the next
	url: string;
}

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export interface AutosaveDependencies {
	storage: Pick<Storage, 'setItem' | 'removeItem'> | null;
	post: (url: string, body: string, keepalive: boolean) => Promise<boolean>;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (handle: unknown) => void;
	delayMs: number;
	onStatus?: (status: AutosaveStatus) => void;
}

// mirrors the draft to this browser on every change and to the server once typing pauses
export class DraftAutosaver {
	#dependencies: AutosaveDependencies;
	#target: AutosaveTarget | null = null;
	#baseline = '';
	#queued: string | null = null;
	#timer: unknown = null;
	#held = false;

	constructor(dependencies: AutosaveDependencies) {
		this.#dependencies = dependencies;
	}

	#status(status: AutosaveStatus) {
		this.#dependencies.onStatus?.(status);
	}

	// a new ship, or the same ship reseeded: what was seeded is not an edit and is never posted.
	// a null target turns saving off (closed and read-only ships)
	seed(target: AutosaveTarget | null, draft: DecisionDraft): void {
		this.flush(false);
		this.#target = target;
		this.#baseline = JSON.stringify(draft);
		this.#held = false;
		this.#status('idle');
	}

	changed(draft: DecisionDraft): void {
		const target = this.#target;
		if (!target) return;
		const body = JSON.stringify(draft);
		if (body === this.#baseline) return;
		this.#baseline = body;
		this.#queued = body;
		try {
			this.#dependencies.storage?.setItem(target.storageKey, serializeStoredDraft(draft));
		} catch {
			// the server copy still saves when browser storage is full or unavailable
		}
		this.#status('pending');
		if (this.#held) return;
		this.#schedule();
	}

	#schedule() {
		if (this.#timer !== null) this.#dependencies.clearTimeout(this.#timer);
		this.#timer = this.#dependencies.setTimeout(() => {
			this.#timer = null;
			this.flush(false);
		}, this.#dependencies.delayMs);
	}

	flush(keepalive: boolean): void {
		if (this.#timer !== null) this.#dependencies.clearTimeout(this.#timer);
		this.#timer = null;
		if (this.#held) return;
		const target = this.#target;
		const body = this.#queued;
		this.#queued = null;
		if (!target || body === null) return;
		this.#status('saving');
		void this.#dependencies
			.post(target.url, body, keepalive)
			.catch(() => false)
			.then((saved) => {
				if (this.#target === target && this.#queued === null)
					this.#status(saved ? 'saved' : 'failed');
			});
	}

	// a decision is being submitted: a save landing after it would bring the draft back
	hold(): void {
		this.#held = true;
		if (this.#timer !== null) this.#dependencies.clearTimeout(this.#timer);
		this.#timer = null;
	}

	resume(): void {
		if (!this.#held) return;
		this.#held = false;
		if (this.#queued !== null) this.#schedule();
	}

	// the decision was recorded: the server deleted its draft, this browser drops its copy
	discard(): void {
		if (this.#timer !== null) this.#dependencies.clearTimeout(this.#timer);
		this.#timer = null;
		this.#queued = null;
		try {
			if (this.#target) this.#dependencies.storage?.removeItem(this.#target.storageKey);
		} catch {
			// nothing to clean up without storage
		}
		this.#target = null;
		this.#status('idle');
	}
}
