export type ClaimAction = 'claim' | 'takeover' | 'heartbeat' | 'release' | 'finishSession';

export interface ClaimReply {
	ok: boolean;
	lost?: boolean;
	locked?: boolean;
	lockedBy?: string | null;
	closed?: boolean;
	reauthUrl?: string | null;
	network?: boolean;
	message?: string;
}

export interface ClaimTarget {
	shipId: string;
	// the ship is open and this viewer may hold it: not closed, not read-only
	claimable: boolean;
}

export interface ClaimSnapshot {
	claimedId: string | null;
	lockLost: boolean;
	takingOver: boolean;
}

export interface ClaimDependencies {
	// every request names its ship, so it can never land on whatever page is current when it fires
	post: (
		action: ClaimAction,
		shipId: string,
		options: { keepalive: boolean }
	) => Promise<ClaimReply>;
	setInterval: (callback: () => void, intervalMs: number) => unknown;
	clearInterval: (handle: unknown) => void;
	heartbeatMs: number;
	isVisible: () => boolean;
	onChange: (snapshot: ClaimSnapshot) => void;
	// another reviewer took the ship between the load and the claim
	onLocked: (shipId: string, lockedBy: string | null) => void;
	onReauth: (url: string) => void;
}

// one request at a time, in the order the reviewer acted: two claims in flight could leave the
// server holding a different ship than the screen shows
export class ClaimMachine {
	#dependencies: ClaimDependencies;
	#target: ClaimTarget | null = null;
	#engagedId: string | null = null;
	#claimedId: string | null = null;
	#lockLost = false;
	#takingOver = false;
	// set while the reviewer is leaving the ship: releasing it must not trigger a re-claim
	#leaving = false;
	#retryClaim = false;
	#queue: Promise<unknown> = Promise.resolve();
	#timer: unknown = null;
	#disposed = false;

	constructor(dependencies: ClaimDependencies) {
		this.#dependencies = dependencies;
	}

	get snapshot(): ClaimSnapshot {
		return { claimedId: this.#claimedId, lockLost: this.#lockLost, takingOver: this.#takingOver };
	}

	get settled(): Promise<void> {
		return this.#queue.then(() => undefined);
	}

	#emit() {
		this.#dependencies.onChange(this.snapshot);
	}

	#enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
		const run = this.#queue.then(operation);
		this.#queue = run.catch(() => undefined);
		return run;
	}

	#isCurrent(shipId: string): boolean {
		return !this.#leaving && this.#target?.shipId === shipId;
	}

	start(): void {
		if (this.#timer !== null || this.#disposed) return;
		this.#timer = this.#dependencies.setInterval(() => this.tick(), this.#dependencies.heartbeatMs);
	}

	// call on every load: a new ship, or fresh lock data for the same one
	engage(target: ClaimTarget | null): void {
		if (this.#disposed) return;
		const changedShip = target?.shipId !== this.#engagedId;
		this.#target = target;
		if (changedShip) {
			this.#engagedId = target?.shipId ?? null;
			this.#leaving = false;
			this.#retryClaim = false;
			if (this.#lockLost) {
				this.#lockLost = false;
				this.#emit();
			}
		}
		if (this.#claimedId && this.#claimedId !== target?.shipId) void this.release();
		if (!target) return;
		if (!target.claimable) {
			// decided, held or handed to someone else: the server already dropped the claim
			if (this.#claimedId === target.shipId) {
				this.#claimedId = null;
				this.#emit();
			}
			return;
		}
		if (this.#leaving || this.#lockLost || this.#claimedId === target.shipId) return;
		this.#claim(target.shipId);
	}

	#claim(shipId: string): void {
		void this.#enqueue(async () => {
			// the reviewer moved on while this waited its turn
			if (!this.#isCurrent(shipId) || !this.#target?.claimable || this.#claimedId === shipId)
				return;
			const reply = await this.#dependencies.post('claim', shipId, { keepalive: false });
			const current = this.#isCurrent(shipId);
			if (reply.ok) {
				if (current) {
					this.#claimedId = shipId;
					this.#lockLost = false;
					this.#retryClaim = false;
					this.#emit();
					return;
				}
				// answered after the reviewer left: the server now holds a ship nobody is looking at
				await this.#dependencies.post('release', shipId, { keepalive: true });
				return;
			}
			if (!current) return;
			if (reply.network) {
				this.#retryClaim = true;
			} else if (reply.reauthUrl) {
				this.#leaving = true;
				this.#dependencies.onReauth(reply.reauthUrl);
			} else if (reply.locked) {
				this.#dependencies.onLocked(shipId, reply.lockedBy ?? null);
			}
		});
	}

	tick(): void {
		const target = this.#target;
		if (!target || this.#leaving || this.#disposed) return;
		if (this.#claimedId === target.shipId) void this.heartbeat();
		else if (this.#retryClaim && target.claimable && !this.#lockLost) this.#claim(target.shipId);
	}

	// only while the tab is visible, so a walked-away claim ages out
	heartbeat(): Promise<void> {
		const shipId = this.#claimedId;
		const target = this.#target;
		if (!shipId || !target || target.shipId !== shipId || !target.claimable)
			return Promise.resolve();
		if (!this.#dependencies.isVisible()) return Promise.resolve();
		return this.#enqueue(async () => {
			if (this.#claimedId !== shipId || !this.#isCurrent(shipId)) return;
			const reply = await this.#dependencies.post('heartbeat', shipId, { keepalive: false });
			if (reply.ok && reply.lost && this.#claimedId === shipId) {
				this.#claimedId = null;
				this.#lockLost = true;
				this.#emit();
			}
		});
	}

	// safe to call twice: the id is forgotten before the request leaves
	release(): Promise<void> {
		const shipId = this.#claimedId;
		if (!shipId) return this.settled;
		this.#claimedId = null;
		this.#emit();
		return this.#enqueue(async () => {
			await this.#dependencies.post('release', shipId, { keepalive: true });
		});
	}

	leave(): Promise<void> {
		this.#leaving = true;
		return this.release();
	}

	stay(): void {
		if (!this.#leaving) return;
		this.#leaving = false;
		this.engage(this.#target);
	}

	// ends the sitting. awaits any claim still in flight first, so nothing is left held
	finishSession(): Promise<void> {
		const shipId = this.#claimedId ?? this.#target?.shipId ?? null;
		this.#leaving = true;
		if (this.#claimedId) {
			this.#claimedId = null;
			this.#emit();
		}
		if (!shipId) return this.settled;
		return this.#enqueue(async () => {
			await this.#dependencies.post('finishSession', shipId, { keepalive: true });
		});
	}

	takeover(): Promise<ClaimReply> {
		const shipId = this.#target?.shipId;
		if (!shipId || this.#takingOver)
			return Promise.resolve({ ok: false, message: 'A takeover is already running.' });
		this.#takingOver = true;
		this.#emit();
		return this.#enqueue(async () => {
			const reply = await this.#dependencies.post('takeover', shipId, { keepalive: false });
			this.#takingOver = false;
			// commit before the reload so the fresh lock data does not trigger a second claim
			if (reply.ok && this.#isCurrent(shipId)) {
				this.#claimedId = shipId;
				this.#lockLost = false;
			}
			this.#emit();
			return reply;
		});
	}

	// the claim lapsed: try to take the ship back without a page reload
	retake(): void {
		if (!this.#lockLost) return;
		this.#lockLost = false;
		this.#emit();
		this.engage(this.#target);
	}

	// a decision closed the ship and dropped the claim server-side: nothing to release
	decided(shipId: string): void {
		if (this.#claimedId !== shipId) return;
		this.#claimedId = null;
		this.#emit();
	}

	// the page is unloading: nothing can wait its turn
	unload(): void {
		const shipId = this.#claimedId ?? (this.#target?.claimable ? this.#target.shipId : null);
		this.#leaving = true;
		this.#claimedId = null;
		if (shipId) void this.#dependencies.post('release', shipId, { keepalive: true });
	}

	dispose(): void {
		if (this.#disposed) return;
		void this.leave();
		this.#disposed = true;
		if (this.#timer !== null) this.#dependencies.clearInterval(this.#timer);
		this.#timer = null;
	}
}
