<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { submitAction } from '$lib/actions';
	import {
		Avatar,
		Button,
		Checkbox,
		ConfirmDialog,
		Field,
		List,
		ListRow,
		TextField
	} from '$lib/components/ui';
	import {
		allTracks,
		programPermissions,
		trackLabel,
		type ProgramPermission,
		type Track
	} from '$lib/data';
	import { toast } from '$lib/toast.svelte';
	import { toggled, validEmail, type PersonSuggestion } from '../rosterTypes';

	interface Props {
		open?: boolean;
		program: string;
		programId: string;
	}
	let { open = $bindable(false), program, programId }: Props = $props();

	const uid = $props.id();
	let emails = $state<string[]>([]);
	let draft = $state('');
	let permissions = $state<ProgramPermission[]>([]);
	let tracks = $state<Track[]>(['software']);
	let suggestions = $state<PersonSuggestion[]>([]);
	let lookupTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (!open) return;
		untrack(() => {
			emails = [];
			draft = '';
			permissions = [];
			tracks = ['software'];
			suggestions = [];
		});
	});

	const pickable = (person: PersonSuggestion) => !person.member && !emails.includes(person.email);
	const draftValid = $derived(validEmail(draft.trim()));
	const addCount = $derived(emails.length + (draftValid && !emails.includes(draft.trim()) ? 1 : 0));

	function addEmail(raw = draft) {
		const email = raw.trim().toLowerCase();
		if (validEmail(email) && !emails.includes(email)) emails = [...emails, email];
		draft = '';
		suggestions = [];
	}

	function lookUp() {
		clearTimeout(lookupTimer);
		const query = draft.trim();
		if (query.length < 2) {
			suggestions = [];
			return;
		}
		// 180ms: long enough that a typed word is one request
		lookupTimer = setTimeout(async () => {
			try {
				const path = resolve('/p/[program]/reviewers/people', { program: programId });
				const response = await fetch(`${path}?q=${encodeURIComponent(query)}`);
				suggestions = response.ok ? ((await response.json()).people ?? []) : [];
			} catch {
				suggestions = [];
			}
		}, 180);
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			const first = suggestions.find(pickable);
			if (draftValid) addEmail();
			else if (first) addEmail(first.email);
		} else if (event.key === 'Backspace' && draft === '' && emails.length) {
			emails = emails.slice(0, -1);
		}
	}

	async function submit() {
		if (draft.trim()) addEmail();
		if (!emails.length) return false;
		const result = await submitAction<{ added: number }>(
			'add',
			{ emails, permissions, tracks },
			{ errorToast: true, fallbackMessage: 'Could not add reviewers' }
		);
		if (!result.ok) return false;
		const added = result.data?.added ?? emails.length;
		toast.success(`${added} reviewer${added === 1 ? '' : 's'} added`, { icon: 'plus' });
	}
</script>

<ConfirmDialog
	bind:open
	size="md"
	icon="plus"
	title="Add reviewers"
	description="Add one or more. They get access to {program} once they sign in."
	confirmLabel={addCount > 1 ? `Add ${addCount} reviewers` : 'Add reviewer'}
	confirmIcon="plus"
	confirmDisabled={addCount === 0}
	onConfirm={submit}
>
	<div class="form">
		<div class="people">
			<TextField
				label="Hack Club emails"
				name="{uid}-email"
				type="text"
				inputmode="email"
				autocomplete="off"
				placeholder={emails.length ? 'Add another…' : 'user1@example.com'}
				hint="Type a name or an email, then press Enter."
				data-autofocus
				bind:value={draft}
				oninput={lookUp}
				onkeydown={onKey}
			/>
			{#if suggestions.length}
				<div class="suggestions" role="group" aria-label="Matching people">
					{#each suggestions as person (person.email)}
						<Button
							variant="quiet"
							block
							disabled={!pickable(person)}
							onclick={() => addEmail(person.email)}
						>
							<span class="suggestion">
								<Avatar
									name={person.name}
									color={person.color}
									slackId={person.slackId}
									size="sm"
									decorative
								/>
								<span class="personName">{person.name}</span>
								<span class="personEmail">{person.email}</span>
								{#if person.member}<span class="state">On {program}</span>
								{:else if emails.includes(person.email)}<span class="state">Added</span>{/if}
							</span>
						</Button>
					{/each}
				</div>
			{/if}
			{#if emails.length}
				<List aria-label="Reviewers to add">
					{#each emails as email (email)}
						<ListRow title={email}>
							{#snippet actions()}
								<Button
									variant="quiet"
									size="sm"
									icon="x"
									aria-label="Remove {email}"
									onclick={() => (emails = emails.filter((entry) => entry !== email))}
								/>
							{/snippet}
						</ListRow>
					{/each}
				</List>
			{/if}
		</div>

		<Field
			label="Permissions"
			id="{uid}-permissions"
			hint="Leave all off for a plain reviewer. Grants can be changed later from the roster."
		>
			{#snippet children(control)}
				<div
					class="choices"
					id={control.id}
					role="group"
					aria-label="Permissions"
					aria-describedby={control.describedBy}
				>
					{#each programPermissions as permission (permission.key)}
						<Checkbox
							title={permission.description}
							checked={permissions.includes(permission.key)}
							onchange={() => (permissions = toggled(permissions, permission.key))}
						>
							{permission.label}
						</Checkbox>
					{/each}
				</div>
			{/snippet}
		</Field>

		<Field label="Review tracks" id="{uid}-tracks" hint="They only see ships in these queues.">
			{#snippet children(control)}
				<div
					class="choices"
					id={control.id}
					role="group"
					aria-label="Review tracks"
					aria-describedby={control.describedBy}
				>
					{#each allTracks as track (track)}
						<Checkbox
							checked={tracks.includes(track)}
							onchange={() => (tracks = toggled(tracks, track))}
						>
							{trackLabel(track)}
						</Checkbox>
					{/each}
				</div>
			{/snippet}
		</Field>
	</div>
</ConfirmDialog>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.people {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.suggestions {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.suggestion {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		text-align: left;
	}
	.personName {
		flex: none;
	}
	.personEmail {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-weight: 500;
		color: var(--text-2);
		text-overflow: ellipsis;
	}
	.state {
		flex: none;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-2);
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-2) var(--space-3);
	}
</style>
