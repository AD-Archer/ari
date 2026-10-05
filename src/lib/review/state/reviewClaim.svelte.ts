import { onMount, untrack } from 'svelte';
import { browser } from '$app/environment';
import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import { submitAction } from '$lib/actions';
import { toast } from '$lib/toast.svelte';
import type { ActionFailure } from '$lib/review/reviewTypes';
import { ClaimMachine, type ClaimAction, type ClaimReply } from './claimMachine';
import type { ReviewContext } from './reviewContext.svelte';

export interface ClaimTiming {
	heartbeatMs: number;
	setInterval: (callback: () => void, intervalMs: number) => unknown;
	clearInterval: (handle: unknown) => void;
}

const browserTiming = (): ClaimTiming => ({
	heartbeatMs: 60000, // one minute: 60 * 1000
	setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
	clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>)
});

export class ReviewClaim {
	claimedId = $state<string | null>(null);
	lockLost = $state(false);
	takingOver = $state(false);
	finishing = $state(false);

	readonly #context: ReviewContext;
	readonly #machine: ClaimMachine;

	constructor(context: ReviewContext, timing: ClaimTiming = browserTiming()) {
		this.#context = context;
		this.#machine = new ClaimMachine({
			...timing,
			post: (action, shipId, options) => this.#post(action, shipId, options.keepalive),
			isVisible: () => document.visibilityState === 'visible',
			onChange: (snapshot) => {
				this.claimedId = snapshot.claimedId;
				this.lockLost = snapshot.lockLost;
				this.takingOver = snapshot.takingOver;
			},
			onLocked: (shipId, lockedBy) => {
				toast.info(`${lockedBy ?? 'Another reviewer'} got to this ship first`, { icon: 'lock' });
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the route's own program id
				void goto(context.advanceHref, { invalidateAll: true });
			},
			onReauth: (url) => {
				window.location.href = url;
			}
		});

		// the component is reused across prev and next, so this runs for every ship and for every
		// fresh copy of the lock data
		$effect(() => {
			const target = {
				shipId: context.ship.id,
				claimable: context.lock.claimable && !context.closed && !context.readOnly
			};
			untrack(() => this.#machine.engage(target));
		});

		beforeNavigate((navigation) => {
			// a query-only change on the same ship is not leaving it
			if (
				navigation.to?.route.id === page.route.id &&
				navigation.to?.params?.id === context.ship.id &&
				!navigation.willUnload
			)
				return;
			void this.#machine.leave();
			navigation.complete.catch(() => this.#machine.stay());
		});

		onMount(() => {
			this.#machine.start();
			const onVisibility = () => {
				if (document.visibilityState === 'visible') void this.#machine.heartbeat();
			};
			const onPageHide = () => this.#machine.unload();
			// restored from the back-forward cache after an unload released the ship
			const onPageShow = (event: PageTransitionEvent) => {
				if (event.persisted) this.#machine.stay();
			};
			document.addEventListener('visibilitychange', onVisibility);
			window.addEventListener('pagehide', onPageHide);
			window.addEventListener('pageshow', onPageShow);
			return () => {
				document.removeEventListener('visibilitychange', onVisibility);
				window.removeEventListener('pagehide', onPageHide);
				window.removeEventListener('pageshow', onPageShow);
				this.#machine.dispose();
			};
		});
	}

	async #post(action: ClaimAction, shipId: string, keepalive: boolean): Promise<ClaimReply> {
		const result = await submitAction<{ ok?: boolean; lost?: boolean }>(
			action,
			{},
			{
				actionUrl: `/p/${this.#context.programId}/review/${shipId}`,
				keepalive,
				invalidate: false
			}
		);
		if (result.ok) return { ok: true, lost: result.data?.lost === true };
		const failure = (result.data ?? {}) as Partial<ActionFailure>;
		return {
			ok: false,
			network: result.status === 0,
			locked: failure.locked === true,
			lockedBy: failure.by ?? null,
			closed: failure.closed === true,
			reauthUrl: failure.reauth ? (failure.url ?? null) : null,
			message: result.message
		};
	}

	readonly held = $derived.by(() => this.claimedId === this.#context.ship.id);

	guardLock(): boolean {
		if (this.#context.readOnly) {
			toast.error(
				`${this.#context.lock.byName ?? 'Another reviewer'} is reviewing this. You're viewing it read-only`,
				{ icon: 'lock' }
			);
			return false;
		}
		if (!this.lockLost) return true;
		toast.error('Your hold on this ship expired. Take it back to keep reviewing', { icon: 'lock' });
		return false;
	}

	async takeover(): Promise<boolean> {
		const reply = await this.#machine.takeover();
		if (!reply.ok) {
			toast.error(reply.message ?? 'Could not take over this review', { icon: 'lock' });
			return false;
		}
		await invalidateAll();
		toast.info('You took over this review', { icon: 'shield' });
		return true;
	}

	// after the hold lapsed: reload the lock data, then claim again if the ship is still free
	async retake(): Promise<void> {
		await invalidateAll();
		this.#machine.retake();
	}

	// ends the sitting: the claim and the step-up grant both go, then back to the list
	async finishSession(): Promise<void> {
		if (this.finishing) return;
		this.finishing = true;
		try {
			await this.#machine.finishSession();
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the route's own program id
			await goto(this.#context.leaveHref);
		} finally {
			this.finishing = false;
		}
	}

	// a decision closed the ship: the server already dropped the claim
	decided(shipId: string): void {
		this.#machine.decided(shipId);
	}

	get settled(): Promise<void> {
		return browser ? this.#machine.settled : Promise.resolve();
	}
}
