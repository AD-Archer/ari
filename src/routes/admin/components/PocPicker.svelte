<script lang="ts">
	import { Avatar, Select } from '$lib/components/ui';
	import type { BoardPerson } from './boardTypes';
	import type { ProgramWizard } from './programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
		people: BoardPerson[];
	}
	let { wizard, people }: Props = $props();

	const byEmail = $derived(new Map(people.map((person) => [person.email.toLowerCase(), person])));
	// an invite-only organizer has no membership to mark, so only signed-in people are offered
	const candidates = $derived(
		wizard.draft.organizers.flatMap((email) => {
			const person = byEmail.get(email);
			return person ? [{ value: email, label: person.name }] : [];
		})
	);
	const pinned = $derived(wizard.pinnedSelf ? byEmail.get(wizard.pinnedSelf) : undefined);
</script>

{#if wizard.pinnedSelf}
	<div class="pinned">
		<span class="label">Program POC</span>
		<span class="person">
			<Avatar
				name={pinned?.name ?? wizard.pinnedSelf}
				color={pinned?.color}
				slackId={pinned?.slackId}
				size="sm"
				decorative
			/>
			{pinned?.name ?? wizard.pinnedSelf}
		</span>
		<span class="note">You are the POC of the programs you create.</span>
	</div>
{:else}
	<Select
		label="Program POC"
		name="poc"
		options={[{ value: '', label: 'No POC' }, ...candidates]}
		hint={candidates.length
			? 'The POC holds every permission and is chosen from the organizers who have signed in.'
			: 'Add an organizer who has signed in first.'}
		bind:value={wizard.draft.poc}
	/>
{/if}

<style>
	.pinned {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.label {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-2);
	}
	.person {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}
	.note {
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
