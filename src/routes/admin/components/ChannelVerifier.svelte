<script lang="ts">
	import { Button, Icon, TextField } from '$lib/components/ui';
	import type { ProgramWizard } from './programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
	}
	let { wizard }: Props = $props();

	const check = $derived(wizard.channel);
	const status = $derived.by(() => {
		if (check.state === 'checking') return 'Checking with Slack…';
		if (check.state === 'ok') return `Ari is in ${check.name ? `#${check.name}` : 'the channel'}.`;
		if (check.state === 'unverified')
			return 'Slack is not configured here, so the channel is saved without being verified.';
		return '';
	});
</script>

<div class="channelVerifier">
	<TextField
		label="Reviewers channel"
		name="reviewersChannel"
		placeholder="C0123ABCDEF or a channel link"
		autocomplete="off"
		required
		hint={check.state === 'unchecked'
			? "Where this program's reviewers coordinate. Ari must be in the channel."
			: undefined}
		error={check.state === 'refused' ? check.message : null}
		bind:value={wizard.draft.reviewersChannel}
		oninput={wizard.channelEdited}
	/>
	{#if status}
		<p class={['status', check.state]} role="status">
			{#if check.state === 'ok'}<Icon name="check" size={14} />
			{:else if check.state === 'unverified'}<Icon name="info" size={14} />{/if}
			{status}
		</p>
	{/if}
	{#if check.state === 'refused'}
		<div>
			<Button size="sm" icon="refresh" onclick={wizard.verifyChannel}>Check again</Button>
		</div>
	{/if}
</div>

<style>
	.channelVerifier {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.status {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	.ok {
		color: var(--status-approved);
	}
</style>
