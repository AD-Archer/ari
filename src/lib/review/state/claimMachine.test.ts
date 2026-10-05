import { describe, expect, test } from 'bun:test';
import {
	ClaimMachine,
	type ClaimAction,
	type ClaimReply,
	type ClaimSnapshot
} from './claimMachine';

interface Pending {
	action: ClaimAction;
	shipId: string;
	keepalive: boolean;
	answer: (reply: ClaimReply) => void;
}

function harness(options: { autoAnswer?: boolean } = {}) {
	const autoAnswer = options.autoAnswer ?? true;
	const sent: string[] = [];
	const pending: Pending[] = [];
	const changes: ClaimSnapshot[] = [];
	const locked: string[] = [];
	const reauth: string[] = [];
	const replies = new Map<string, ClaimReply>();
	let visible = true;
	let intervalCallback: (() => void) | null = null;
	let intervalMs = 0;
	let cleared = false;

	const machine = new ClaimMachine({
		post: (action, shipId, { keepalive }) => {
			sent.push(`${action} ${shipId}`);
			const canned = replies.get(`${action} ${shipId}`);
			if (canned) return Promise.resolve(canned);
			if (autoAnswer) return Promise.resolve({ ok: true });
			return new Promise((resolve) => pending.push({ action, shipId, keepalive, answer: resolve }));
		},
		setInterval: (callback, milliseconds) => {
			intervalCallback = callback;
			intervalMs = milliseconds;
			return 1;
		},
		clearInterval: () => {
			cleared = true;
			intervalCallback = null;
		},
		heartbeatMs: 60000,
		isVisible: () => visible,
		onChange: (snapshot) => changes.push(snapshot),
		onLocked: (shipId) => locked.push(shipId),
		onReauth: (url) => reauth.push(url)
	});

	return {
		machine,
		sent,
		pending,
		changes,
		locked,
		reauth,
		replies,
		setVisible: (next: boolean) => (visible = next),
		fireInterval: () => intervalCallback?.(),
		intervalMs: () => intervalMs,
		cleared: () => cleared,
		// lets the queued requests run up to the next unanswered one
		flush: async () => {
			for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
		}
	};
}

const open = (shipId: string) => ({ shipId, claimable: true });

describe('claim on open', () => {
	test('an open ship is claimed once', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		machine.engage(open('shipA'));
		await machine.settled;
		expect(sent).toEqual(['claim shipA']);
		expect(machine.snapshot.claimedId).toBe('shipA');
	});

	test('a closed or read-only ship is never claimed', async () => {
		const { machine, sent } = harness();
		machine.engage({ shipId: 'shipA', claimable: false });
		await machine.settled;
		expect(sent).toEqual([]);
	});

	test('losing the race reports who holds it', async () => {
		const { machine, replies, locked } = harness();
		replies.set('claim shipA', { ok: false, locked: true, lockedBy: 'Sam' });
		machine.engage(open('shipA'));
		await machine.settled;
		expect(locked).toEqual(['shipA']);
		expect(machine.snapshot.claimedId).toBeNull();
	});

	test('a lapsed reauth grant sends the browser to re-verify and stops claiming', async () => {
		const { machine, replies, reauth, sent } = harness();
		replies.set('claim shipA', { ok: false, reauthUrl: '/auth/login?reauth=1' });
		machine.engage(open('shipA'));
		await machine.settled;
		machine.engage(open('shipA'));
		await machine.settled;
		expect(reauth).toEqual(['/auth/login?reauth=1']);
		expect(sent).toEqual(['claim shipA']);
	});

	test('a network failure is retried on the next interval', async () => {
		const { machine, replies, sent, fireInterval } = harness();
		replies.set('claim shipA', { ok: false, network: true });
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		replies.delete('claim shipA');
		fireInterval();
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'claim shipA']);
		expect(machine.snapshot.claimedId).toBe('shipA');
	});
});

describe('moving between ships', () => {
	test('the first ship is released before the second is claimed', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		void machine.leave();
		machine.engage(open('shipB'));
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA', 'claim shipB']);
		expect(machine.snapshot.claimedId).toBe('shipB');
	});

	test('a claim answered after the reviewer moved on is ignored and handed back', async () => {
		const { machine, sent, pending, flush } = harness({ autoAnswer: false });
		machine.engage(open('shipA'));
		await flush();
		void machine.leave();
		machine.engage(open('shipB'));
		pending[0].answer({ ok: true });
		await flush();
		expect(machine.snapshot.claimedId).toBeNull();
		pending[1].answer({ ok: true });
		await flush();
		pending[2].answer({ ok: true });
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA', 'claim shipB']);
		expect(machine.snapshot.claimedId).toBe('shipB');
	});

	test('ships skipped through while a claim is in flight are never claimed', async () => {
		const { machine, sent, pending, flush } = harness({ autoAnswer: false });
		machine.engage(open('shipA'));
		await flush();
		for (const shipId of ['shipB', 'shipC', 'shipD']) {
			void machine.leave();
			machine.engage(open(shipId));
		}
		while (pending.length) {
			pending.shift()!.answer({ ok: true });
			await flush();
		}
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA', 'claim shipD']);
		expect(machine.snapshot.claimedId).toBe('shipD');
	});

	test('a lost lock on one ship does not follow the reviewer to the next', async () => {
		const { machine, replies } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		replies.set('heartbeat shipA', { ok: true, lost: true });
		await machine.heartbeat();
		expect(machine.snapshot.lockLost).toBe(true);
		void machine.leave();
		machine.engage({ shipId: 'shipB', claimable: false });
		expect(machine.snapshot.lockLost).toBe(false);
	});

	test('a cancelled navigation holds the ship again', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		void machine.leave();
		machine.stay();
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA', 'claim shipA']);
		expect(machine.snapshot.claimedId).toBe('shipA');
	});
});

describe('release', () => {
	test('releasing twice sends one request', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		void machine.release();
		void machine.leave();
		machine.dispose();
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA']);
	});

	test('leaving does not re-claim the ship being left', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		void machine.leave();
		machine.engage(open('shipA'));
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'release shipA']);
	});

	test('releases are keepalive and name their ship', async () => {
		const { machine, pending, flush } = harness({ autoAnswer: false });
		machine.engage(open('shipA'));
		await flush();
		pending[0].answer({ ok: true });
		await flush();
		void machine.leave();
		await flush();
		expect(pending[1]).toMatchObject({ action: 'release', shipId: 'shipA', keepalive: true });
	});

	test('unloading releases at once, even with a claim still in flight', async () => {
		const { machine, sent, flush } = harness({ autoAnswer: false });
		machine.engage(open('shipA'));
		await flush();
		machine.unload();
		expect(sent).toEqual(['claim shipA', 'release shipA']);
	});
});

describe('finish session', () => {
	test('releases the claim through the finish action and nothing else', async () => {
		const { machine, sent } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		await machine.finishSession();
		void machine.leave();
		machine.engage(open('shipA'));
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'finishSession shipA']);
		expect(machine.snapshot.claimedId).toBeNull();
	});

	test('a claim still in flight is handed back before the session ends', async () => {
		const { machine, sent, pending, flush } = harness({ autoAnswer: false });
		machine.engage(open('shipA'));
		await flush();
		const finished = machine.finishSession();
		pending[0].answer({ ok: true });
		await flush();
		pending[1].answer({ ok: true });
		await flush();
		pending[2].answer({ ok: true });
		await finished;
		expect(sent).toEqual(['claim shipA', 'release shipA', 'finishSession shipA']);
		expect(machine.snapshot.claimedId).toBeNull();
	});
});

describe('heartbeat', () => {
	test('runs on the injected interval while the ship is held and the tab is visible', async () => {
		const { machine, sent, fireInterval, intervalMs, setVisible } = harness();
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		fireInterval();
		await machine.settled;
		setVisible(false);
		fireInterval();
		await machine.settled;
		expect(intervalMs()).toBe(60000);
		expect(sent).toEqual(['claim shipA', 'heartbeat shipA']);
	});

	test('stops once the lock is lost, and decisions are told', async () => {
		const { machine, sent, replies, fireInterval } = harness();
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		replies.set('heartbeat shipA', { ok: true, lost: true });
		fireInterval();
		await machine.settled;
		fireInterval();
		machine.engage(open('shipA'));
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'heartbeat shipA']);
		expect(machine.snapshot).toMatchObject({ claimedId: null, lockLost: true });
	});

	test('stops once the ship is closed', async () => {
		const { machine, sent, fireInterval } = harness();
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		machine.engage({ shipId: 'shipA', claimable: false });
		fireInterval();
		await machine.settled;
		expect(sent).toEqual(['claim shipA']);
		expect(machine.snapshot.claimedId).toBeNull();
	});

	test('a decision drops the claim without a release or another heartbeat', async () => {
		const { machine, sent, fireInterval } = harness();
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		machine.decided('shipA');
		fireInterval();
		void machine.leave();
		await machine.settled;
		expect(sent).toEqual(['claim shipA']);
	});

	test('retaking a lost lock claims again', async () => {
		const { machine, sent, replies } = harness();
		machine.engage(open('shipA'));
		await machine.settled;
		replies.set('heartbeat shipA', { ok: true, lost: true });
		await machine.heartbeat();
		machine.retake();
		await machine.settled;
		expect(sent).toEqual(['claim shipA', 'heartbeat shipA', 'claim shipA']);
		expect(machine.snapshot).toMatchObject({ claimedId: 'shipA', lockLost: false });
	});

	test('dispose clears the interval and releases', async () => {
		const { machine, sent, cleared } = harness();
		machine.start();
		machine.engage(open('shipA'));
		await machine.settled;
		machine.dispose();
		await machine.settled;
		expect(cleared()).toBe(true);
		expect(sent).toEqual(['claim shipA', 'release shipA']);
	});
});

describe('takeover', () => {
	test('commits the claim so the reload does not claim again', async () => {
		const { machine, sent } = harness();
		machine.engage({ shipId: 'shipA', claimable: false });
		const reply = await machine.takeover();
		machine.engage(open('shipA'));
		await machine.settled;
		expect(reply.ok).toBe(true);
		expect(sent).toEqual(['takeover shipA']);
		expect(machine.snapshot).toMatchObject({ claimedId: 'shipA', takingOver: false });
	});

	test('a refused takeover leaves the ship read-only', async () => {
		const { machine, replies } = harness();
		replies.set('takeover shipA', { ok: false, message: 'No permission' });
		machine.engage({ shipId: 'shipA', claimable: false });
		const reply = await machine.takeover();
		expect(reply.message).toBe('No permission');
		expect(machine.snapshot.claimedId).toBeNull();
	});
});
