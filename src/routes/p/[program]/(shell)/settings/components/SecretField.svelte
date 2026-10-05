<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, ConfirmDialog, Dialog } from '$lib/components/ui';
	import { copyText, submitAction } from '$lib/actions';
	import { toast } from '$lib/toast.svelte';

	interface Props {
		title: string;
		masked: string | null;
		emptyLabel: string;
		rollAction: string;
		revealAction: string;
		rollWarning: string;
		children: Snippet;
	}
	let { title, masked, emptyLabel, rollAction, revealAction, rollWarning, children }: Props =
		$props();

	let confirmOpen = $state(false);
	let revealOpen = $state(false);
	// the plaintext lives here only while the reveal dialog is open
	let plaintext = $state('');
	let justRolled = $state(false);
	let busy = $state(false);

	function show(secret: string, rolled: boolean) {
		plaintext = secret;
		justRolled = rolled;
		revealOpen = true;
	}

	function closeReveal() {
		revealOpen = false;
		plaintext = '';
	}

	async function roll(): Promise<string | null> {
		const result = await submitAction<{ plaintext: string }>(rollAction, {});
		if (!result.ok) return result.message || 'Could not roll the secret';
		if (!result.data?.plaintext) return 'Could not roll the secret';
		show(result.data.plaintext, true);
		return null;
	}

	async function generate() {
		if (busy) return;
		busy = true;
		const problem = await roll();
		busy = false;
		if (problem) toast.error(problem);
	}

	async function confirmRoll() {
		const problem = await roll();
		if (problem) throw new Error(problem);
	}

	async function reveal() {
		if (busy) return;
		busy = true;
		const result = await submitAction<{ plaintext: string }>(
			revealAction,
			{},
			{ invalidate: false, errorToast: true, fallbackMessage: 'Could not reveal the secret' }
		);
		busy = false;
		if (result.ok && result.data?.plaintext) show(result.data.plaintext, false);
	}
</script>

<div class="secretField">
	<h3>{title}</h3>
	<div class="row">
		<code class={{ empty: !masked }}>{masked ?? emptyLabel}</code>
		{#if masked}
			<Button size="sm" icon="lock" loading={busy} onclick={reveal}>Reveal</Button>
			<Button size="sm" icon="refresh" onclick={() => (confirmOpen = true)}>Roll</Button>
		{:else}
			<Button size="sm" variant="soft" icon="plus" loading={busy} onclick={generate}>
				Generate
			</Button>
		{/if}
	</div>
	<p>{@render children()}</p>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title={`Roll the ${title.toLowerCase()}?`}
	icon="refresh"
	tone="danger"
	confirmLabel="Roll secret"
	onConfirm={confirmRoll}
>
	<p class="confirm">{rollWarning}</p>
</ConfirmDialog>

<Dialog
	bind:open={revealOpen}
	title={justRolled ? 'New secret generated' : title}
	description="Copy it now. It is hidden again once you close this."
	icon={justRolled ? 'check' : 'lock'}
	tone={justRolled ? 'ok' : 'default'}
	dismissible={false}
>
	<code class="secret">{plaintext}</code>
	{#snippet footer()}
		<Button variant="quiet" onclick={closeReveal}>Done</Button>
		<Button
			variant="primary"
			icon="clip"
			data-autofocus
			onclick={() => copyText(plaintext, 'Secret copied')}
		>
			Copy secret
		</Button>
	{/snippet}
</Dialog>

<style>
	.secretField {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		word-break: break-all;
	}
	.row code {
		flex: 1 1 220px;
		min-width: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.empty {
		color: var(--text-3);
	}
	.secret {
		display: block;
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		user-select: all;
	}
	p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.confirm {
		font-size: var(--text-md);
	}
</style>
