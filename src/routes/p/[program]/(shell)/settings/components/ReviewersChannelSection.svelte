<script lang="ts">
	import { Badge, TextField } from '$lib/components/ui';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	type ChannelStatus =
		| { state: 'in_channel' | 'not_in_channel'; name: string | null }
		| { state: 'not_found' | 'no_token' }
		| { state: 'error'; error: string }
		| null;

	interface Props {
		form: SettingsForm;
		savedChannel: string;
		status: Promise<ChannelStatus>;
	}
	let { form, savedChannel, status }: Props = $props();

	const unchanged = $derived(
		savedChannel !== '' && form.values.reviewersChannel.trim() === savedChannel
	);

	function problemWith(checked: NonNullable<ChannelStatus>): string | null {
		switch (checked.state) {
			case 'in_channel':
				return null;
			case 'not_in_channel':
				return `The Ari Slack App is not in ${checked.name ? `#${checked.name}` : 'the reviewers channel'} yet. Run /invite @Ari Services there so it can remove members.`;
			case 'not_found':
				return "Ari can't see the reviewers channel. Check the id, and for a private channel run /invite @Ari Services there first.";
			case 'no_token':
				return "Slack is not configured on this instance, so the reviewers channel can't be checked.";
			default:
				return checked.error === 'missing_scope'
					? "The Ari Slack app is missing OAuth scopes, so the reviewers channel can't be checked."
					: `Couldn't check the reviewers channel right now (${checked.error}). Saving still works.`;
		}
	}
</script>

<SettingSection
	title="Reviewers channel"
	description="The Slack channel where this program's reviewers communicate. Ari invites people to it when they join the program and removes them when they leave. Setting it invites the current roster too."
>
	<TextField
		label="Channel id or link"
		name="reviewersChannel"
		placeholder="C0123ABCDEF or a link to the channel"
		bind:value={form.values.reviewersChannel}
	/>
	{#if unchanged}
		{#await status then checked}
			{@const problem = checked ? problemWith(checked) : null}
			{#if checked?.state === 'in_channel'}
				<p class="state">
					<Badge tone="approved" dot>Connected</Badge>
					<span>#{checked.name}</span>
				</p>
			{:else if problem}
				<p class="state">
					<Badge tone={checked?.state === 'not_found' ? 'rejected' : 'pending'} dot>
						Not connected
					</Badge>
					<span>{problem}</span>
				</p>
			{/if}
		{:catch}
			<p class="state"><span>Couldn't check the reviewers channel right now.</span></p>
		{/await}
	{/if}
</SettingSection>

<style>
	.state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
