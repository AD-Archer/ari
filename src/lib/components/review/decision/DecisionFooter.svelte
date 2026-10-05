<script lang="ts">
	import { Button, ConfirmDialog, Kbd, Tooltip } from '$lib/components/ui';
	import type { OpenAction } from '$lib/review/state/reviewDecision.svelte';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';
	import BlockedList from './BlockedList.svelte';
	import DecisionSummary from './DecisionSummary.svelte';
	import WizardNav from './WizardNav.svelte';

	const { context, claim, decision, refusal, settlement, validation, wizard, keybinds } =
		useReview();

	const blocked = $derived(claim.lockLost || context.readOnly);
	let confirming = $state<OpenAction | null>(null);
	let dialogOpen = $state(false);

	const decisionOfAction = { approve: 'approved', changes: 'changes', reject: 'rejected' } as const;
	const copy = $derived({
		approve: {
			title: `Approve ${context.ship.title}?`,
			description: `${formatDuration(settlement.approvedSeconds)} is approved and the maker gets your note.`,
			label: 'Approve',
			tone: 'ok',
			icon: 'check'
		},
		changes: {
			title: `Request changes on ${context.ship.title}?`,
			description:
				'The ship goes back to the maker with your note, and they can ship a new version.',
			label: 'Request changes',
			tone: 'default',
			icon: 'clock'
		},
		reject: {
			title: `Reject ${context.ship.title}?`,
			description: 'The ship is rejected and the maker gets your note explaining why.',
			label: 'Reject',
			tone: 'danger',
			icon: 'x'
		}
	} as const);

	function ask(action: OpenAction): void | false {
		// another dialog (the ship editor, the shortcuts list) is in front
		if (document.querySelector('dialog[open]')) return false;
		if (!decision.request(action)) return;
		confirming = action;
		dialogOpen = true;
	}

	// the claim went to someone else, or the ship's data was replaced, while the dialog was up:
	// there is nothing left to confirm and the banner that says so must not sit behind it
	$effect(() => {
		if (blocked || refusal.staleIngest) dialogOpen = false;
	});

	async function confirmOpen() {
		if (confirming && (await decision.submit(confirming))) dialogOpen = false;
	}

	$effect(() =>
		keybinds.registerShortcuts('decision', [
			{
				id: 'decApprove',
				label: 'Approve',
				defaultBinding: 'mod+Enter',
				allowInDialog: true,
				// the key that opened the dialog confirms it
				handler: () => (dialogOpen ? void confirmOpen() : ask('approve'))
			},
			{
				id: 'decChanges',
				label: 'Request changes',
				defaultBinding: 'mod+shift+Enter',
				allowInDialog: true,
				handler: () => (dialogOpen ? void confirmOpen() : ask('changes'))
			},
			{
				id: 'decReject',
				label: 'Reject',
				defaultBinding: 'mod+Backspace',
				handler: () => ask('reject')
			},
			{
				id: 'wizBack',
				label: 'Wizard: back a step',
				defaultBinding: 'mod+ArrowLeft',
				handler: () => wizard.back()
			},
			{
				id: 'wizNext',
				label: 'Wizard: next step',
				defaultBinding: 'mod+ArrowRight',
				when: () => !blocked,
				handler: () => wizard.next()
			}
		])
	);
</script>

{#snippet decide(action: OpenAction, bind: 'decApprove' | 'decChanges' | 'decReject', hint: string)}
	{@const why = validation.whyNot(action)}
	{#snippet button()}
		<Button
			variant={action === 'approve' ? 'ok' : action === 'reject' ? 'danger' : 'ghost'}
			block
			icon={copy[action].icon}
			disabled={blocked || why !== null}
			loading={decision.busy === action}
			title={why ? undefined : `${hint} (${keybinds.label(bind)})`}
			data-decision={action}
			onclick={() => ask(action)}
		>
			{action === 'approve'
				? `Approve · ${formatDuration(settlement.approvedSeconds)}`
				: copy[action].label}
			<Kbd keys={keybinds.label(bind)} />
		</Button>
	{/snippet}
	<div class="decide">
		{#if why}
			<Tooltip text={why}>{@render button()}</Tooltip>
		{:else}
			{@render button()}
		{/if}
	</div>
{/snippet}

<WizardNav {blocked} />

{#if !wizard.active || wizard.onLastStep}
	<BlockedList action="approve" heading="Before you can approve" />
	{@render decide(
		'approve',
		'decApprove',
		`Approve and credit ${formatDuration(settlement.approvedSeconds)}`
	)}
	{@render decide(
		'changes',
		'decChanges',
		'Send the ship back with your note: the maker can ship a new version'
	)}
	{@render decide(
		'reject',
		'decReject',
		'Rejection means no credit at all. Use request changes for ships that need work'
	)}
{/if}

{#if confirming}
	<ConfirmDialog
		bind:open={dialogOpen}
		title={copy[confirming].title}
		description={copy[confirming].description}
		icon={copy[confirming].icon}
		tone={copy[confirming].tone}
		size="md"
		confirmLabel="{copy[confirming].label} ({keybinds.label(
			confirming === 'changes' ? 'decChanges' : 'decApprove'
		)})"
		confirmIcon={copy[confirming].icon}
		busy={decision.busy !== null}
		onConfirm={() => (confirming ? decision.submit(confirming) : false)}
	>
		<DecisionSummary
			decision={decisionOfAction[confirming]}
			held={context.shipState.holds[decisionOfAction[confirming]]}
		/>
	</ConfirmDialog>
{/if}

<style>
	.decide :global(.tooltip) {
		display: flex;
	}
	.decide :global(.tooltip > .button) {
		flex: 1;
	}
</style>
