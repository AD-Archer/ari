<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Button, Icon } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	const { context, claim, refusal } = useReview();
	const holder = $derived(context.lock.byName ?? 'Another reviewer');
	// the org view tier reaches the page without ever being able to review
	const viewOnly = $derived(context.readOnly && !context.viewer.canReview);
	// right after a requeue the ship is open again but its evidence is still being captured
	const processing = $derived(context.ship.status === 'processing');

	let staleBanner = $state<HTMLElement>();
	$effect(() => {
		if (!refusal.staleIngest || !staleBanner) return;
		const button = staleBanner.querySelector('button');
		// a timer, not a tick: the confirm dialog closes on this same change and hands focus
		// back to the button that opened it
		const timer = setTimeout(() => button?.focus(), 0);
		return () => clearTimeout(timer);
	});

	let reloading = $state(false);
	async function reload() {
		reloading = true;
		try {
			await invalidateAll();
		} finally {
			reloading = false;
		}
	}
</script>

{#if context.readOnly && !context.closed}
	<div class="banner" role="alert" data-review-region="lockBanner" data-lock="readOnly">
		<Icon name="lock" size={15} />
		{#if viewOnly}
			<span>You can look at this ship, but you are not a reviewer of this program.</span>
		{:else}
			<span>{holder} is reviewing this ship. You're viewing it read-only.</span>
			{#if context.viewer.canOverride}
				<Button
					size="sm"
					icon="shield"
					loading={claim.takingOver}
					title="Displace {context.lock.byName ??
						'the current reviewer'} and review this ship yourself"
					onclick={() => claim.takeover()}
				>
					Take over review
				</Button>
			{/if}
		{/if}
	</div>
{:else if claim.lockLost}
	<div class="banner" role="alert" data-review-region="lockBanner" data-lock="lost">
		<Icon name="lock" size={15} />
		<span>Your hold on this ship expired. Someone else may be reviewing it now.</span>
		<Button size="sm" icon="refresh" onclick={() => claim.retake()}>Take it back</Button>
	</div>
{/if}
{#if processing}
	<div class="banner calm" role="status" data-review-region="lockBanner" data-lock="processing">
		<Icon name="clock" size={15} />
		<span>
			This ship was sent back to the queue and its evidence is being captured again. You can read it
			and write notes, but a decision has to wait until it is pending.
		</span>
		<Button size="sm" icon="refresh" loading={reloading} onclick={reload}>Check again</Button>
	</div>
{/if}
{#if refusal.staleIngest}
	<div
		class="banner"
		role="alert"
		data-review-region="lockBanner"
		data-lock="stale"
		bind:this={staleBanner}
	>
		<Icon name="refresh" size={15} />
		<span>This ship was updated while you were reviewing it. Your notes are kept.</span>
		<Button size="sm" icon="refresh" onclick={() => refusal.reload()}>Load the latest data</Button>
	</div>
{/if}

<style>
	.banner {
		--banner-color: var(--color-orange);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid color-mix(in srgb, var(--banner-color) 40%, var(--border));
		background: color-mix(in srgb, var(--banner-color) 12%, var(--surface));
		color: var(--text);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.banner.calm {
		--banner-color: var(--color-blue);
	}
	.banner span {
		flex: 1 1 220px;
		min-width: 0;
	}
	@media (max-width: 700px) {
		.banner {
			padding: var(--space-2) var(--space-3);
		}
	}
</style>
