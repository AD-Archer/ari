<script lang="ts">
	import { Avatar, Button, List, ListRow, TextField, Tooltip } from '$lib/components/ui';
	import type { BoardPerson } from './boardTypes';
	import type { ProgramWizard } from './programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
		people: BoardPerson[];
	}
	let { wizard, people }: Props = $props();

	let query = $state('');

	const byEmail = $derived(new Map(people.map((person) => [person.email.toLowerCase(), person])));
	const matches = $derived.by(() => {
		const term = query.trim().toLowerCase();
		if (!term) return [];
		return people
			.filter(
				(person) =>
					!wizard.draft.organizers.includes(person.email.toLowerCase()) &&
					(person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term))
			)
			.slice(0, 8); // 8 suggestions at most, so the list stays short
	});

	function add(person: BoardPerson) {
		wizard.addOrganizer(person);
		query = '';
	}

	function onKey(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		if (matches[0]) add(matches[0]);
	}
</script>

<div class="organizerPicker">
	<TextField
		label="Organizers"
		name="organizerSearch"
		autocomplete="off"
		placeholder="Search people by name or email"
		hint="Organizers hold every program permission."
		bind:value={query}
		onkeydown={onKey}
	/>
	{#if matches.length}
		<div class="matches" role="group" aria-label="Matching people">
			{#each matches as person (person.email)}
				<Button variant="quiet" block onclick={() => add(person)}>
					<span class="match">
						<Avatar
							name={person.name}
							color={person.color}
							slackId={person.slackId}
							size="sm"
							decorative
						/>
						<span class="name">{person.name}</span>
						<span class="email">{person.email}</span>
					</span>
				</Button>
			{/each}
		</div>
	{:else if query.trim()}
		<p class="note">No matches.</p>
	{/if}
	{#if wizard.draft.organizers.length}
		<List aria-label="Organizers">
			{#each wizard.draft.organizers as email (email)}
				{@const person = byEmail.get(email)}
				<ListRow title={person?.name ?? email} meta={person ? person.email : 'Invited on save'}>
					{#snippet leading()}
						<Avatar
							name={person?.name ?? email}
							color={person?.color}
							slackId={person?.slackId}
							size="sm"
							decorative
						/>
					{/snippet}
					{#snippet actions()}
						{#if email === wizard.pinnedSelf}
							<Tooltip text="You organize the programs you create">
								<Button variant="quiet" size="sm" icon="lock" aria-label="Pinned" disabled />
							</Tooltip>
						{:else}
							<Button
								variant="quiet"
								size="sm"
								icon="x"
								aria-label="Remove {person?.name ?? email}"
								onclick={() => wizard.removeOrganizer(email)}
							/>
						{/if}
					{/snippet}
				</ListRow>
			{/each}
		</List>
	{:else}
		<p class="note">No organizers yet.</p>
	{/if}
</div>

<style>
	.organizerPicker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.matches {
		display: flex;
		flex-direction: column;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.match {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-width: 0;
		text-align: left;
	}
	.name {
		flex: none;
		font-weight: 600;
	}
	.email {
		overflow: hidden;
		font-size: var(--text-sm);
		color: var(--text-2);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.note {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
