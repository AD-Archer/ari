<script lang="ts">
	import { Button, Checkbox, Dialog, Select, TextField } from '$lib/components/ui';
	import { allTracks, type Track } from '$lib/data';
	import {
		fieldKeyFor,
		fieldTypes,
		hasOptions,
		slugKey,
		splitOptions,
		type FieldDraft,
		type FieldType
	} from '$lib/settingsRules';
	import TrackPicker from './TrackPicker.svelte';

	interface Props {
		open?: boolean;
		field: FieldDraft | null;
		takenKeys: string[];
		onSave: (field: Omit<FieldDraft, 'id'>) => void;
	}
	let { open = $bindable(false), field, takenKeys, onSave }: Props = $props();

	let type = $state<string>('checkbox');
	let label = $state('');
	let key = $state('');
	let description = $state('');
	let options = $state('');
	let required = $state(false);
	let tracks = $state<Track[]>([...allTracks]);
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			type = field?.type ?? 'checkbox';
			label = field?.label ?? '';
			key = field?.key ?? '';
			description = field?.description ?? '';
			options = field?.options.join(', ') ?? '';
			required = field?.required ?? false;
			tracks = field ? [...field.tracks] : [...allTracks];
		}
		wasOpen = open;
	});

	const fieldType = $derived(type as FieldType);
	const resolvedKey = $derived(fieldKeyFor(key, label));
	const keyError = $derived(
		label.trim() && takenKeys.includes(resolvedKey)
			? `Another field already uses "${resolvedKey}".`
			: null
	);
	const canSave = $derived(Boolean(label.trim()) && tracks.length > 0 && !keyError);

	function save() {
		if (!canSave) return;
		onSave({
			type: fieldType,
			label: label.trim(),
			description: description.trim() || null,
			key: resolvedKey,
			options: hasOptions(fieldType) ? splitOptions(options) : [],
			required,
			tracks: [...tracks]
		});
		open = false;
	}
</script>

<Dialog
	bind:open
	title={field ? 'Edit review field' : 'Add review field'}
	description="The value name is what the answer is labeled as in the review results."
	icon="layers"
>
	<div class="editor">
		<div class="columns">
			<Select label="Field type" name="fieldType" options={fieldTypes} bind:value={type} />
			<TextField
				label="Title"
				name="fieldLabel"
				placeholder="e.g. Eligible for grand prize"
				required
				data-autofocus
				bind:value={label}
			/>
		</div>
		<TextField
			label="Value name"
			name="fieldKey"
			mono
			placeholder={label ? slugKey(label) || 'field' : 'grand_prize'}
			hint={key.trim() && resolvedKey !== key.trim() ? `Saved as ${resolvedKey}` : undefined}
			error={keyError}
			bind:value={key}
		/>
		<TextField
			label="Description (optional)"
			name="fieldDescription"
			placeholder="Help text shown under the field to reviewers"
			bind:value={description}
		/>
		{#if hasOptions(fieldType)}
			<TextField
				label="Options (comma-separated)"
				name="fieldOptions"
				placeholder="Beginner, Intermediate, Advanced"
				bind:value={options}
			/>
		{/if}
		<div class="row">
			<Checkbox bind:checked={required}>Required: must be answered before approving</Checkbox>
			<TrackPicker label="Tracks" bind:selected={tracks} />
		</div>
	</div>
	{#snippet footer()}
		<Button variant="quiet" onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon={field ? undefined : 'plus'} disabled={!canSave} onclick={save}>
			{field ? 'Done' : 'Add field'}
		</Button>
	{/snippet}
</Dialog>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.columns {
		display: grid;
		grid-template-columns: minmax(140px, 1fr) minmax(0, 2fr);
		gap: var(--space-3);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: var(--text-sm);
	}
	@media (max-width: 480px) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
