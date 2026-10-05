<script lang="ts">
	import {
		Button,
		Dialog,
		EmptyState,
		List,
		ListRow,
		Textarea,
		TextField
	} from '$lib/components/ui';
	import { slugName, type SnippetDraft } from '$lib/settingsRules';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { form }: { form: SettingsForm } = $props();

	let dialogOpen = $state(false);
	let editId = $state<string | null>(null);
	let name = $state('');
	let body = $state('');

	const resolvedName = $derived(slugName(name));
	const nameError = $derived(
		resolvedName &&
			form.tools.snippets.some((snippet) => snippet.id !== editId && snippet.name === resolvedName)
			? `A snippet named /${resolvedName} already exists.`
			: null
	);
	// 5000 characters is the longest snippet the server stores
	const canSave = $derived(
		Boolean(resolvedName) && Boolean(body.trim()) && body.trim().length <= 5000 && !nameError
	);

	function openDialog(snippet: SnippetDraft | null) {
		editId = snippet?.id ?? null;
		name = snippet?.name ?? '';
		body = snippet?.body ?? '';
		dialogOpen = true;
	}

	function save() {
		if (!canSave) return;
		const draft = { name: resolvedName, body: body.trim() };
		const target = editId;
		form.tools.snippets = target
			? form.tools.snippets.map((snippet) =>
					snippet.id === target ? { ...draft, id: target } : snippet
				)
			: [...form.tools.snippets, { ...draft, id: form.newId() }];
		dialogOpen = false;
	}

	function remove(id: string) {
		form.tools.snippets = form.tools.snippets.filter((snippet) => snippet.id !== id);
	}
</script>

<SettingSection title="Response snippets">
	{#snippet intro()}
		<p>
			Reusable templates for the note to the maker. Reviewers type <code>/name</code> in the note box
			and press Enter to insert one.
		</p>
	{/snippet}
	{#if form.tools.snippets.length}
		<List aria-label="Response snippets">
			{#each form.tools.snippets as snippet (snippet.id)}
				<ListRow title={`/${snippet.name}`}>
					<span class="body">{snippet.body}</span>
					{#snippet actions()}
						<Button
							size="sm"
							variant="quiet"
							aria-label={`Edit /${snippet.name}`}
							onclick={() => openDialog(snippet)}
						>
							Edit
						</Button>
						<Button
							size="sm"
							variant="quiet"
							icon="x"
							aria-label={`Remove /${snippet.name}`}
							onclick={() => remove(snippet.id)}
						/>
					{/snippet}
				</ListRow>
			{/each}
		</List>
	{:else}
		<EmptyState title="No snippets yet" icon="msg">
			Add a template reviewers can insert with a slash command.
		</EmptyState>
	{/if}
	<div>
		<Button icon="plus" onclick={() => openDialog(null)}>Add snippet</Button>
	</div>
</SettingSection>

<Dialog bind:open={dialogOpen} title={editId ? 'Edit snippet' : 'Add snippet'} icon="msg">
	<div class="editor">
		<TextField
			label="Name"
			name="snippetName"
			mono
			placeholder="reviewers type /this-name"
			hint={resolvedName && resolvedName !== name ? `Saved as /${resolvedName}` : undefined}
			error={nameError}
			data-autofocus
			bind:value={name}
		/>
		<Textarea
			label="Text"
			name="snippetBody"
			rows={5}
			maxlength={5000}
			placeholder="Template text inserted into the note to the maker…"
			bind:value={body}
		/>
	</div>
	{#snippet footer()}
		<Button variant="quiet" onclick={() => (dialogOpen = false)}>Cancel</Button>
		<Button variant="primary" disabled={!canSave} onclick={save}>
			{editId ? 'Done' : 'Add snippet'}
		</Button>
	{/snippet}
</Dialog>

<style>
	.body {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	code {
		font-family: var(--font-mono);
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
</style>
