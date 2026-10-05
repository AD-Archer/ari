<script lang="ts">
	import DecidedSummary from '$lib/components/review/decision/DecidedSummary.svelte';
	import DecisionFooter from '$lib/components/review/decision/DecisionFooter.svelte';
	import HeldPanel from '$lib/components/review/decision/HeldPanel.svelte';
	import EvidenceArea from '$lib/components/review/evidence/EvidenceArea.svelte';
	import ProjectHeader from '$lib/components/review/header/ProjectHeader.svelte';
	import ReviewRail from '$lib/components/review/rail/ReviewRail.svelte';
	import LockBanner from '$lib/components/review/shell/LockBanner.svelte';
	import RailBubble from '$lib/components/review/shell/RailBubble.svelte';
	import RailResizeHandle from '$lib/components/review/shell/RailResizeHandle.svelte';
	import ReviewActionBar from '$lib/components/review/shell/ReviewActionBar.svelte';
	import ShortcutsDialog from '$lib/components/review/shell/ShortcutsDialog.svelte';
	import WarningList from '$lib/components/review/shell/WarningList.svelte';
	import { railWidth } from '$lib/review/state/railSize.svelte';
	import { createReviewPage } from '$lib/review/state/reviewPage.svelte';

	let { data } = $props();

	const review = createReviewPage(() => data);
	const { context, rail } = review;
</script>

<svelte:head><title>{context.ship.title} · Review · {context.programName}</title></svelte:head>
<svelte:window onkeydown={review.keybinds.handleKey} />

<div class="reviewPage" data-review-track={context.ship.track}>
	<ReviewActionBar />
	<LockBanner />
	<div
		class={{ reviewBody: true, railCollapsed: rail.collapsed, railResizing: rail.resizing }}
		use:railWidth={rail.width}
	>
		<main class="reviewMain" data-review-region="main">
			<WarningList />
			<!-- remounted per ship so nothing a component keeps locally leaks into the next one -->
			{#key context.shipKey}
				<ProjectHeader />
			{/key}
			<EvidenceArea />
		</main>
		{#if !rail.collapsed}
			<aside
				id="reviewRail"
				class={{ reviewRail: true, hidePending: rail.hidePending }}
				data-review-region="rail"
				data-review-rail
				aria-label="Review"
			>
				<RailResizeHandle />
				{#key context.shipKey}
					<ReviewRail>
						{#snippet footer()}
							{#if context.secondPass}
								<HeldPanel />
							{:else if context.closed}
								<DecidedSummary />
							{:else}
								<DecisionFooter />
							{/if}
						{/snippet}
					</ReviewRail>
				{/key}
			</aside>
		{/if}
	</div>
	{#if rail.collapsed}
		<RailBubble />
	{/if}
	<ShortcutsDialog />
</div>

<style>
	.reviewPage {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: var(--bg);
	}
	.reviewBody {
		--review-rail-default: 320px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--review-rail-width, var(--review-rail-default));
		flex: 1;
		min-height: 0;
	}
	.reviewBody.railCollapsed {
		grid-template-columns: minmax(0, 1fr);
	}
	.reviewBody.railResizing {
		cursor: ew-resize;
		user-select: none;
	}
	.reviewMain {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		min-width: 0;
		min-height: 0;
		padding: var(--space-5);
		overflow-y: auto;
		scroll-padding-top: var(--space-4);
	}
	.reviewRail {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border-left: 1px solid var(--border-2);
		background: var(--surface);
	}
	.reviewRail.hidePending {
		opacity: 0.45;
	}

	/* below 700px the rail stacks under the evidence and the page scrolls as one */
	@media (max-width: 700px) {
		.reviewPage {
			height: auto;
			min-height: 100dvh;
		}
		.reviewBody,
		.reviewBody.railCollapsed {
			display: flex;
			flex-direction: column;
		}
		.reviewMain {
			padding: var(--space-4);
			overflow-y: visible;
		}
		.reviewRail {
			border-top: 1px solid var(--border-2);
			border-left: 0;
		}
	}
</style>
