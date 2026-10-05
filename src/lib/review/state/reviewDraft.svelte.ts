import { onMount, untrack } from 'svelte';
import { browser } from '$app/environment';
import { beforeNavigate } from '$app/navigation';
import { clampSeconds } from '$lib/time';
import type { DecisionDraft, FieldValue } from '$lib/review/reviewTypes';
import { DraftAutosaver, type AutosaveStatus, type AutosaveTarget } from './draftAutosave';
import {
	draftStorageKey,
	readStoredDraft,
	seedDraft,
	timeFingerprint,
	type AdjustmentKind
} from './draftSeed';
import type { ReviewContext } from './reviewContext.svelte';

export interface DraftTiming {
	delayMs: number;
	setTimeout: (callback: () => void, delayMs: number) => unknown;
	clearTimeout: (handle: unknown) => void;
}

const browserTiming = (): DraftTiming => ({
	delayMs: 600, // long enough that a burst of typing is one save
	setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
	clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
});

async function postDraft(url: string, body: string, keepalive: boolean): Promise<boolean> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body,
		keepalive
	});
	return response.ok;
}

export class ReviewDraft {
	// bind to its fields directly: draft.value.note, draft.value.checks[index], ...
	value = $state<DecisionDraft>(seedDraft(emptySeed()));
	saveStatus = $state<AutosaveStatus>('idle');

	readonly #context: ReviewContext;
	readonly #saver: DraftAutosaver;
	#seededKey: string | null = null;
	#seededTime = $state('');

	constructor(context: ReviewContext, timing: DraftTiming = browserTiming()) {
		this.#context = context;
		this.#saver = new DraftAutosaver({
			...timing,
			storage: browser ? safeStorage() : null,
			post: postDraft,
			onStatus: (status) => {
				this.saveStatus = status;
			}
		});
		// the server render and the first client render must agree, so this first seed leaves
		// the browser's own copy out. the effect below adds it once the page is live
		this.#seed(null);

		// keyed on the ship alone: the seed is computed from load data inside untrack, so nothing
		// it writes can re-run it
		$effect.pre(() => {
			// a takeover turns a read-only view into a review: saving starts, from this viewer's draft
			const key = `${context.shipKey}:${context.readOnly ? 'view' : 'edit'}`;
			untrack(() => {
				if (key === this.#seededKey) return;
				this.#seed(this.#readStored());
				this.#seededKey = key;
			});
		});

		$effect(() => {
			const snapshot = $state.snapshot(this.value);
			untrack(() => this.#saver.changed(snapshot));
		});

		beforeNavigate(() => this.#saver.flush(true));
		onMount(() => {
			const onPageHide = () => this.#saver.flush(true);
			window.addEventListener('pagehide', onPageHide);
			return () => {
				window.removeEventListener('pagehide', onPageHide);
				this.#saver.flush(true);
			};
		});
	}

	#storageKey(): string {
		return draftStorageKey(this.#context.programName, this.#context.ship.id);
	}

	#readStored(): DecisionDraft | null {
		try {
			return readStoredDraft(localStorage.getItem(this.#storageKey()));
		} catch {
			return null;
		}
	}

	#seed(stored: DecisionDraft | null): void {
		const context = this.#context;
		const data = context.data;
		const seeded = seedDraft({
			closed: context.closed,
			draft: data.draft,
			recorded: data.recorded,
			stored,
			checklistCount: data.checklist.length,
			fixIds: data.fixes.map((fix) => fix.reviewId)
		});
		// only the claim holder builds a decision on an open ship: nothing else is ever saved
		const target: AutosaveTarget | null =
			context.closed || context.readOnly
				? null
				: {
						storageKey: this.#storageKey(),
						url: `/p/${context.programId}/review/${context.ship.id}/draft`
					};
		this.#saver.seed(target, seeded);
		this.#seededTime = timeFingerprint(seeded);
		this.value = seeded;
	}

	readonly editable = $derived.by(() => !this.#context.railLocked);
	readonly timeEditable = $derived.by(() => !this.#context.timeLocked);
	// the checklist and the fix confirmations belong to the reviewer: an organizer confirming a
	// held ship cannot change them
	readonly checksEditable = $derived.by(() => this.editable && !this.#context.closed);
	readonly timeEdited = $derived(timeFingerprint(this.value) !== this.#seededTime);

	// what the reviewer asked for on one evidence row. the settlement has the final word
	rowSeconds(kind: AdjustmentKind, rowId: string, capturedSeconds: number): number {
		const requested = clampSeconds(this.value.adjustments[kind]?.[rowId], capturedSeconds);
		return requested ?? capturedSeconds;
	}

	// a row can only be reduced: at or above what was captured clears the reduction
	setRowSeconds(kind: AdjustmentKind, rowId: string, seconds: number, capturedSeconds: number) {
		if (!this.timeEditable) return;
		const rows = (this.value.adjustments[kind] ??= {});
		const clamped = clampSeconds(seconds, capturedSeconds);
		if (clamped === null || clamped === capturedSeconds) delete rows[rowId];
		else rows[rowId] = clamped;
	}

	setDeflate(seconds: number | null) {
		if (!this.timeEditable) return;
		this.value.deflateSeconds = seconds && seconds > 0 ? Math.trunc(seconds) : null;
	}

	setCollaboratorDeflate(makerId: string, seconds: number | null) {
		if (!this.timeEditable) return;
		if (seconds && seconds > 0) this.value.collaboratorDeflates[makerId] = Math.trunc(seconds);
		else delete this.value.collaboratorDeflates[makerId];
	}

	setCollaboratorNote(makerId: string, note: string) {
		if (!this.editable) return;
		if (note) this.value.collaboratorNotes[makerId] = note;
		else delete this.value.collaboratorNotes[makerId];
	}

	setField(key: string, fieldValue: FieldValue) {
		if (this.editable) this.value.fieldValues[key] = fieldValue;
	}

	setCheck(index: number, checked: boolean) {
		if (this.checksEditable && index >= 0 && index < this.value.checks.length)
			this.value.checks[index] = checked;
	}

	fixConfirmed(reviewId: string): boolean {
		return this.value.fixChecks.includes(reviewId);
	}

	setFixConfirmed(reviewId: string, confirmed: boolean) {
		if (!this.checksEditable) return;
		const others = this.value.fixChecks.filter((id) => id !== reviewId);
		this.value.fixChecks = confirmed ? [...others, reviewId] : others;
	}

	snapshot(): DecisionDraft {
		return $state.snapshot(this.value);
	}

	holdSaving(): void {
		this.#saver.hold();
	}
	resumeSaving(): void {
		this.#saver.resume();
	}
	discardSaved(): void {
		this.#saver.discard();
	}
}

function emptySeed() {
	return {
		closed: true,
		draft: null,
		recorded: null,
		stored: null,
		checklistCount: 0,
		fixIds: []
	};
}

function safeStorage(): Pick<Storage, 'setItem' | 'removeItem'> | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
