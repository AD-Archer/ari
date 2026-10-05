<script lang="ts">
	import { untrack } from 'svelte';
	import { submitAction } from '$lib/actions';
	import { Checkbox, ConfirmDialog, Field } from '$lib/components/ui';
	import {
		allTracks,
		programPermissions,
		trackLabel,
		type ProgramPermission,
		type Track
	} from '$lib/data';
	import { toast } from '$lib/toast.svelte';
	import { toggled, type AccessMember } from './access';

	interface Props {
		open?: boolean;
		member: AccessMember | null;
	}
	let { open = $bindable(false), member }: Props = $props();

	const uid = $props.id();
	let tracks = $state<Track[]>([]);
	let permissions = $state<ProgramPermission[]>([]);

	// the draft is seeded once per opening: the member can change underneath an open dialog (a
	// save reloads the page data) and must not overwrite what is being edited
	$effect(() => {
		if (!open) return;
		untrack(() => {
			if (!member) return;
			tracks = [...member.tracks];
			permissions = [...member.permissions];
		});
	});

	const sameSet = (first: string[], second: string[]) =>
		[...first].sort().join(',') === [...second].sort().join(',');
	const tracksChanged = $derived(!!member && !sameSet(member.tracks, tracks));
	const permissionsChanged = $derived(!!member && !sameSet(member.permissions, permissions));

	async function save() {
		if (!member?.userId) return false;
		const name = member.name;
		// one action and one transaction: both parts are saved or neither is
		const result = await submitAction(
			'access',
			{ userId: member.userId, tracks, permissions },
			{ errorToast: true, fallbackMessage: 'Could not save access' }
		);
		if (!result.ok) return false;
		toast.success(`Access updated for ${name}`, { icon: 'shield' });
	}
</script>

<ConfirmDialog
	bind:open
	size="md"
	icon="shield"
	title="Edit access"
	description={member ? `${member.name} · ${member.email}` : undefined}
	confirmLabel="Save access"
	confirmDisabled={tracks.length === 0 || (!tracksChanged && !permissionsChanged)}
	onConfirm={save}
>
	<div class="form">
		<Field
			label="Review tracks"
			id="{uid}-tracks"
			hint="They only see ships in these queues."
			error={tracks.length === 0 ? 'A reviewer needs at least one track.' : null}
		>
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

		<Field label="Permissions" id="{uid}-permissions" hint="All off is a plain reviewer.">
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
	</div>
</ConfirmDialog>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.choices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: var(--space-2) var(--space-3);
	}
</style>
