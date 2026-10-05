import { describe, expect, test } from 'bun:test';
import type { DecisionDraft } from '$lib/review/reviewTypes';
import { DraftAutosaver, type AutosaveStatus } from './draftAutosave';
import {
	draftStorageKey,
	emptyDraft,
	readStoredDraft,
	seedDraft,
	serializeStoredDraft,
	timeFingerprint,
	type SeedInput
} from './draftSeed';

const draftWith = (overrides: Partial<DecisionDraft>): DecisionDraft => ({
	...emptyDraft(),
	...overrides
});

const seedInput = (overrides: Partial<SeedInput>): SeedInput => ({
	closed: false,
	draft: null,
	recorded: null,
	stored: null,
	checklistCount: 0,
	fixIds: [],
	...overrides
});

describe('seeding precedence', () => {
	test('an open ship takes the server draft over this browser and the defaults', () => {
		const seeded = seedDraft(
			seedInput({
				draft: draftWith({ note: 'from the server' }),
				stored: draftWith({ note: 'from this browser' })
			})
		);
		expect(seeded.note).toBe('from the server');
	});

	test('with no server draft the copy in this browser is used', () => {
		const seeded = seedDraft(seedInput({ stored: draftWith({ note: 'from this browser' }) }));
		expect(seeded.note).toBe('from this browser');
	});

	test('a held or decided ship shows what was recorded, never a leftover draft', () => {
		const seeded = seedDraft(
			seedInput({
				closed: true,
				draft: draftWith({ note: 'stale draft' }),
				stored: draftWith({ note: 'stale local' }),
				recorded: draftWith({ note: 'the held decision', deflateSeconds: 1803 })
			})
		);
		expect(seeded.note).toBe('the held decision');
		expect(seeded.deflateSeconds).toBe(1803);
	});

	test('nothing stored gives the defaults, with one unticked box per checklist item', () => {
		const seeded = seedDraft(seedInput({ checklistCount: 3 }));
		expect(seeded).toMatchObject({ note: '', audit: '', deflateSeconds: null });
		expect(seeded.checks).toEqual([false, false, false]);
		expect(seeded.adjustments).toEqual({
			devlogs: {},
			clips: {},
			hackatime: {},
			program: {},
			commits: {},
			after: {}
		});
	});

	test('ticks saved against a different checklist start over', () => {
		const seeded = seedDraft(
			seedInput({ checklistCount: 3, draft: draftWith({ checks: [true, true] }) })
		);
		expect(seeded.checks).toEqual([false, false, false]);
	});

	test('fix confirmations for feedback no longer shown are dropped', () => {
		const seeded = seedDraft(
			seedInput({
				fixIds: ['reviewNow'],
				draft: draftWith({ fixChecks: ['reviewNow', 'reviewGone'] })
			})
		);
		expect(seeded.fixChecks).toEqual(['reviewNow']);
	});

	test('the seed is a copy: editing it leaves the load data alone', () => {
		const source = draftWith({ adjustments: { devlogs: { devlogOne: 600 } } });
		const seeded = seedDraft(seedInput({ draft: source }));
		seeded.adjustments.devlogs!.devlogOne = 0;
		expect(source.adjustments.devlogs).toEqual({ devlogOne: 600 });
	});
});

describe('stored draft', () => {
	test('the key is the one the old page wrote', () => {
		expect(draftStorageKey('Lighthouse', 'seedShipWeather')).toBe(
			'ari-review:Lighthouse:seedShipWeather'
		);
	});

	test('an old draft in minutes and decimal hours is converted to seconds, not discarded', () => {
		const stored = readStoredDraft(
			JSON.stringify({
				note: 'Nice work',
				audit: 'Checked the repo',
				technicalFeatures: 'Auth flow',
				adjust: { devlogs: { devlogOne: 30 }, clips: {}, hackatime: { hackatime: 90 } },
				deflate: '1.5',
				collabNotes: { makerOne: 'Yours was short' },
				collabDeflate: { makerOne: '0.25', makerTwo: '' },
				fields: { buildQuality: 'good' },
				checks: [true, false],
				fixChecks: ['reviewOne']
			})
		);
		expect(stored).toMatchObject({
			note: 'Nice work',
			audit: 'Checked the repo',
			technicalFeatures: 'Auth flow',
			adjustments: { devlogs: { devlogOne: 1800 }, hackatime: { hackatime: 5400 } },
			deflateSeconds: 5400,
			collaboratorNotes: { makerOne: 'Yours was short' },
			collaboratorDeflates: { makerOne: 900 },
			fieldValues: { buildQuality: 'good' },
			checks: [true, false],
			fixChecks: ['reviewOne']
		});
	});

	test('an old draft with no deflate reads as none', () => {
		expect(
			readStoredDraft(JSON.stringify({ note: 'hello', deflate: '' }))?.deflateSeconds
		).toBeNull();
	});

	test('what this version writes reads back unchanged', () => {
		const draft = draftWith({
			note: 'kept',
			adjustments: { clips: { clipOne: 45 } },
			deflateSeconds: 61,
			collaboratorDeflates: { makerOne: 7 }
		});
		expect(readStoredDraft(serializeStoredDraft(draft))).toEqual(draft);
	});

	test('a draft stored with the inputs reviews no longer collect loads without them', () => {
		const earlier = {
			timeEvidence: 'time evidence 1.',
			supportingEvidence: 'supporting evidence 1.',
			hoursReasoning: 'hours reasoning 1.',
			additionalJustification: 'additional justification 1.'
		};
		const kept = draftWith({ note: 'kept', technicalFeatures: 'technical features 1.' });
		for (const stored of [
			{ timeModel: 'seconds', ...kept, ...earlier },
			{ note: 'kept', technicalFeatures: 'technical features 1.', ...earlier }
		])
			expect(readStoredDraft(JSON.stringify(stored))).toEqual(kept);
	});

	test('junk reads as nothing stored', () => {
		expect(readStoredDraft(null)).toBeNull();
		expect(readStoredDraft('{not json')).toBeNull();
		expect(readStoredDraft('[]')).toBeNull();
	});

	test('the time fingerprint ignores empty groups and key order', () => {
		const first = draftWith({ adjustments: { devlogs: { one: 1, two: 2 }, clips: {} } });
		const second = draftWith({ adjustments: { devlogs: { two: 2, one: 1 } } });
		expect(timeFingerprint(first)).toBe(timeFingerprint(second));
		expect(timeFingerprint(first)).not.toBe(timeFingerprint(draftWith({ deflateSeconds: 60 })));
	});
});

function autosaveHarness() {
	const posts: { url: string; body: DecisionDraft; keepalive: boolean }[] = [];
	const stored = new Map<string, string>();
	const statuses: AutosaveStatus[] = [];
	const timers = new Map<number, { callback: () => void; delayMs: number }>();
	let nextTimer = 0;
	const saver = new DraftAutosaver({
		storage: {
			setItem: (key, value) => void stored.set(key, value),
			removeItem: (key) => void stored.delete(key)
		},
		post: async (url, body, keepalive) => {
			posts.push({ url, body: JSON.parse(body), keepalive });
			return true;
		},
		setTimeout: (callback, delayMs) => {
			nextTimer += 1;
			timers.set(nextTimer, { callback, delayMs });
			return nextTimer;
		},
		clearTimeout: (handle) => void timers.delete(handle as number),
		delayMs: 600,
		onStatus: (status) => statuses.push(status)
	});
	return {
		saver,
		posts,
		stored,
		statuses,
		timers,
		runTimers: () => {
			for (const [handle, timer] of [...timers]) {
				timers.delete(handle);
				timer.callback();
			}
		}
	};
}

const weather = {
	storageKey: 'ari-review:Lighthouse:shipA',
	url: '/p/lighthouse/review/shipA/draft'
};
const chess = {
	storageKey: 'ari-review:Lighthouse:shipB',
	url: '/p/lighthouse/review/shipB/draft'
};

describe('autosave', () => {
	test('seeding saves nothing, here or on the server', () => {
		const { saver, posts, stored, timers, runTimers } = autosaveHarness();
		const seeded = draftWith({ note: 'from the server' });
		saver.seed(weather, seeded);
		saver.changed(structuredClone(seeded));
		runTimers();
		expect(timers.size).toBe(0);
		expect(posts).toEqual([]);
		expect(stored.size).toBe(0);
	});

	test('an edit is mirrored at once and posted after the pause', () => {
		const { saver, posts, stored, timers, runTimers } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ note: 'a' }));
		saver.changed(draftWith({ note: 'ab', deflateSeconds: 90 }));
		expect(posts).toEqual([]);
		expect([...timers.values()].map((timer) => timer.delayMs)).toEqual([600]);
		expect(readStoredDraft(stored.get(weather.storageKey) ?? null)).toMatchObject({
			note: 'ab',
			deflateSeconds: 90
		});
		runTimers();
		expect(posts).toHaveLength(1);
		expect(posts[0]).toMatchObject({ url: weather.url, keepalive: false });
		expect(posts[0].body).toMatchObject({ note: 'ab', deflateSeconds: 90 });
	});

	test('moving to another ship sends the waiting save to the ship it was typed on', () => {
		const { saver, posts, runTimers } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ note: 'for the first ship' }));
		saver.seed(chess, draftWith({ note: 'second ship draft' }));
		runTimers();
		expect(posts.map((post) => [post.url, post.body.note])).toEqual([
			[weather.url, 'for the first ship']
		]);
	});

	test('leaving flushes with keepalive', () => {
		const { saver, posts } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ audit: 'unsaved' }));
		saver.flush(true);
		saver.flush(true);
		expect(posts).toHaveLength(1);
		expect(posts[0].keepalive).toBe(true);
	});

	test('a closed or read-only ship never saves', () => {
		const { saver, posts, stored, runTimers } = autosaveHarness();
		saver.seed(null, emptyDraft());
		saver.changed(draftWith({ note: 'organizer edit on a held ship' }));
		runTimers();
		expect(posts).toEqual([]);
		expect(stored.size).toBe(0);
	});

	test('nothing is posted while a decision is in flight, and a refusal resumes saving', () => {
		const { saver, posts, runTimers } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ note: 'typed' }));
		saver.hold();
		runTimers();
		saver.flush(true);
		expect(posts).toEqual([]);
		saver.resume();
		runTimers();
		expect(posts.map((post) => post.body.note)).toEqual(['typed']);
	});

	test("a recorded decision drops the waiting save and this browser's copy", () => {
		const { saver, posts, stored, runTimers } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ note: 'typed' }));
		saver.hold();
		saver.discard();
		runTimers();
		saver.flush(true);
		expect(posts).toEqual([]);
		expect(stored.has(weather.storageKey)).toBe(false);
	});

	test('the status follows the save', async () => {
		const { saver, statuses, runTimers } = autosaveHarness();
		saver.seed(weather, emptyDraft());
		saver.changed(draftWith({ note: 'typed' }));
		runTimers();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(statuses).toEqual(['idle', 'pending', 'saving', 'saved']);
	});
});
