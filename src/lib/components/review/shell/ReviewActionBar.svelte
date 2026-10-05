<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, Kbd, Meter } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import ShipEditDialog from '../header/ShipEditDialog.svelte';
	import ShipDetails from './ShipDetails.svelte';
	import TimelineCard from './TimelineCard.svelte';
	import VmLauncher from './VmLauncher.svelte';

	const review = useReview();
	const { context, claim, keybinds } = review;

	const back = $derived({
		href: context.leaveHref,
		label: context.returnHref
			? context.returnHref.includes('/activity')
				? 'Back to log'
				: 'Back'
			: context.secondPass
				? 'Back to second pass'
				: 'Back to queue'
	});
	const goal = $derived(context.data.reviewGoal);
	// under 40% of the weekly goal reads as behind
	const goalTone = $derived(
		goal.weekCount >= goal.goal ? 'ok' : goal.weekCount * 100 < goal.goal * 40 ? 'warn' : 'primary'
	);

	let editOpen = $state(false);
	// only a ship waiting for review can be corrected, and only by someone who may review it
	const canEdit = $derived(context.ship.status === 'pending' && context.viewer.canReview);

	function edit() {
		if (claim.guardLock()) editOpen = true;
	}

	function open(href: string | null) {
		if (!href) return false;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the route's own program id
		void goto(href);
	}

	$effect(() =>
		keybinds.registerShortcuts('navigation', [
			{
				id: 'next',
				label: 'Next submission',
				defaultBinding: 'j',
				handler: () => open(context.nextHref)
			},
			{
				id: 'prev',
				label: 'Previous submission',
				defaultBinding: 'd',
				handler: () => open(context.previousHref)
			},
			{
				id: 'help',
				label: 'This help',
				defaultBinding: '?',
				handler: () => {
					keybinds.helpOpen = !keybinds.helpOpen;
				}
			}
		])
	);
</script>

<header class="actionBar" data-review-region="actionBar">
	<div class="lead">
		<Button href={back.href} variant="quiet" size="sm" icon="arrowL" title={back.label}>
			<span class="wide">{back.label}</span>
		</Button>
		{#if context.navigation.inQueue}
			<p class="position">
				<strong>
					{context.secondPass ? 'Held ship' : 'Submission'}
					{context.navigation.index + 1}
				</strong>
				of {context.navigation.total}
			</p>
			<div class="steps">
				<Button
					size="sm"
					icon="arrowL"
					href={context.previousHref ?? undefined}
					disabled={!context.previousHref}
					aria-label="Previous submission"
					title={keybinds.title('prev')}
					data-review-step="previous"
				/>
				<Button
					size="sm"
					icon="arrowR"
					href={context.nextHref ?? undefined}
					disabled={!context.nextHref}
					aria-label="Next submission"
					title={keybinds.title('next')}
					data-review-step="next"
				/>
				<span class="keys">
					<Kbd keys={keybinds.label('prev')} title={keybinds.title('prev')} />
					<Kbd keys={keybinds.label('next')} title={keybinds.title('next')} />
				</span>
			</div>
		{/if}
	</div>
	{#if goal.goal > 0}
		<div class="goal" title="{goal.weekCount} of {goal.goal} reviews this week">
			<Meter
				label="this week"
				value={goal.weekCount}
				max={goal.goal}
				tone={goalTone}
				layout="inline"
			/>
		</div>
	{/if}
	<div class="tools">
		<VmLauncher />
		{#if canEdit}
			<Button
				size="sm"
				icon="config"
				disabled={context.readOnly || claim.lockLost}
				title={context.readOnly
					? 'Only the reviewer holding this ship can edit it'
					: 'Edit ship details'}
				aria-label="Edit ship"
				data-review-edit
				onclick={edit}
			>
				<span class="wide">Edit ship</span>
			</Button>
		{/if}
		<ShipDetails />
		<TimelineCard />
		<Button
			size="sm"
			variant="quiet"
			icon="info"
			title={keybinds.title('help', 'Keyboard shortcuts')}
			aria-label="Keyboard shortcuts"
			onclick={() => (keybinds.helpOpen = true)}
		>
			<span class="wide">Shortcuts</span>
			<span class="keys"><Kbd keys={keybinds.label('help')} /></span>
		</Button>
		<Button
			size="sm"
			variant="soft"
			icon="checkCircle"
			loading={claim.finishing}
			title="Finish session and go back to the list"
			onclick={() => claim.finishSession()}
		>
			<span>Finish<span class="wide">&nbsp;session</span></span>
		</Button>
	</div>
</header>
{#if canEdit}
	<ShipEditDialog bind:open={editOpen} />
{/if}

<style>
	.actionBar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-4);
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border-2);
		background: var(--surface);
	}
	.lead,
	.steps,
	.tools,
	.keys {
		display: flex;
		align-items: center;
	}
	.lead {
		gap: var(--space-3);
		min-width: 0;
	}
	.steps {
		gap: var(--space-1);
	}
	.keys {
		gap: var(--space-1);
		margin-left: var(--space-1);
	}
	.position {
		margin: 0;
		color: var(--text-2);
		font-size: var(--text-sm);
		white-space: nowrap;
	}
	.position strong {
		color: var(--text);
	}
	.goal {
		flex: 1 1 160px;
		min-width: 140px;
		max-width: 260px;
		margin-inline: auto;
	}
	.tools {
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-left: auto;
	}

	/* narrow: the lead row, then the goal and the tools as icons on one line */
	@media (max-width: 700px) {
		.actionBar {
			gap: var(--space-2);
			padding: var(--space-2) var(--space-3);
		}
		.lead {
			flex: 1 1 100%;
			gap: var(--space-2);
		}
		.steps {
			margin-left: auto;
		}
		.goal {
			flex: 1 1 120px;
			min-width: 110px;
			margin-inline: 0;
		}
		.tools {
			flex-wrap: nowrap;
			gap: var(--space-1);
		}
		.wide,
		.keys {
			display: none;
		}
	}
</style>
