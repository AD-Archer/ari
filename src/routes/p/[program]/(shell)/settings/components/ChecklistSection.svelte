<script lang="ts">
	import { Badge, Button, Dialog, EmptyState, SortableList, TextField } from '$lib/components/ui';
	import { allTracks, type Track } from '$lib/data';
	import type { ChecklistDraft } from '$lib/settingsRules';
	import type { SettingsForm } from '../settingsForm.svelte';
	import { tracksLabel } from '../settingsLabels';
	import SettingSection from '$lib/components/app/SettingSection.svelte';
	import TrackPicker from './TrackPicker.svelte';

	let { form }: { form: SettingsForm } = $props();

	let newLabel = $state('');
	let newTracks = $state<Track[]>([...allTracks]);

	let editOpen = $state(false);
	let editId = $state('');
	let editLabel = $state('');
	let editTracks = $state<Track[]>([]);

	function add() {
		const label = newLabel.trim();
		if (!label || !newTracks.length) return;
		form.tools.checklist = [
			...form.tools.checklist,
			{ id: form.newId(), label, tracks: [...newTracks] }
		];
		newLabel = '';
		newTracks = [...allTracks];
	}

	function startEdit(item: ChecklistDraft) {
		editId = item.id;
		editLabel = item.label;
		editTracks = [...item.tracks];
		editOpen = true;
	}

	function saveEdit() {
		const label = editLabel.trim();
		if (!label || !editTracks.length) return;
		form.tools.checklist = form.tools.checklist.map((item) =>
			item.id === editId ? { ...item, label, tracks: [...editTracks] } : item
		);
		editOpen = false;
	}

	function remove(id: string) {
		form.tools.checklist = form.tools.checklist.filter((item) => item.id !== id);
	}
</script>

<SettingSection
	title="Approval checklist"
	description="Requirements a reviewer confirms before approving."
>
	{#if form.tools.checklist.length}
		<SortableList
			label="Approval checklist"
			bind:items={() => form.tools.checklist, (next) => (form.tools.checklist = next)}
			itemKey={(item) => item.id}
			itemLabel={(item) => item.label}
		>
			{#snippet item({ item: entry, dragHandle, moveButtons })}
				{@render dragHandle()}
				<div class="rowContent">
					<span class="label">{entry.label}</span>
					<div class="controls">
						<Badge>{tracksLabel(entry.tracks)}</Badge>
						{@render moveButtons()}
						<Button
							size="sm"
							variant="quiet"
							aria-label={`Edit ${entry.label}`}
							onclick={() => startEdit(entry)}
						>
							Edit
						</Button>
						<Button
							size="sm"
							variant="quiet"
							icon="x"
							aria-label={`Remove ${entry.label}`}
							onclick={() => remove(entry.id)}
						/>
					</div>
				</div>
			{/snippet}
		</SortableList>
	{:else}
		<EmptyState title="No requirements yet" icon="checkCircle">
			Reviewers approve without a checklist until you add one.
		</EmptyState>
	{/if}
	<div class="addRow">
		<div class="grow">
			<TextField
				label="Add a requirement"
				name="newChecklistItem"
				placeholder="e.g. Demo link opens and works"
				bind:value={newLabel}
				onkeydown={(event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					add();
				}}
			/>
		</div>
		<TrackPicker label="Tracks for the new requirement" bind:selected={newTracks} />
		<Button icon="plus" disabled={!newLabel.trim() || !newTracks.length} onclick={add}>Add</Button>
	</div>
</SettingSection>

<Dialog bind:open={editOpen} title="Edit requirement" icon="checkCircle" size="sm">
	<div class="editor">
		<TextField
			label="Requirement"
			name="editChecklistItem"
			data-autofocus
			bind:value={editLabel}
			onkeydown={(event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				saveEdit();
			}}
		/>
		<TrackPicker label="Tracks" align="start" bind:selected={editTracks} />
	</div>
	{#snippet footer()}
		<Button variant="quiet" onclick={() => (editOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={!editLabel.trim() || !editTracks.length} onclick={saveEdit}>
			Done
		</Button>
	{/snippet}
</Dialog>

<style>
	.rowContent {
		display: flex;
		flex: 1;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}
	.label {
		flex: 1 1 180px;
		min-width: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.addRow {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.grow {
		flex: 1 1 220px;
		min-width: 0;
	}
	.editor {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
	}
	.editor > :global(.field) {
		align-self: stretch;
	}
</style>
