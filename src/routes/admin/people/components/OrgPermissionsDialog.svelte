<script lang="ts">
	import { Button, Checkbox, Dialog } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { orgPermissions, type OrgPermission } from '$lib/data';
	import { toast } from '$lib/toast.svelte';

	interface Props {
		open?: boolean;
		person: { name: string; email: string; orgPermissions: OrgPermission[] } | null;
		grantable: OrgPermission[];
	}
	let { open = $bindable(false), person, grantable }: Props = $props();

	let draft = $state<OrgPermission[]>([]);
	let saving = $state(false);

	$effect(() => {
		if (open && person) draft = [...person.orgPermissions];
	});

	function toggle(permission: OrgPermission) {
		draft = draft.includes(permission)
			? draft.filter((entry) => entry !== permission)
			: [...draft, permission];
	}

	async function save() {
		if (!person) return;
		saving = true;
		const result = await submitAction(
			'setOrgPermissions',
			{ email: person.email, orgPermissions: draft },
			{ errorToast: true, fallbackMessage: 'Could not update permissions' }
		);
		saving = false;
		if (!result.ok) return;
		toast.success(`Updated ${person.name}'s org permissions`, { icon: 'shield' });
		open = false;
	}
</script>

<Dialog
	bind:open
	title="Org permissions"
	description={`What ${person?.name ?? 'this person'} can do across the whole org.`}
	icon="shield"
>
	<ul class="permissions">
		{#each orgPermissions as permission (permission.key)}
			{@const selected = draft.includes(permission.key)}
			{@const locked = !selected && !grantable.includes(permission.key)}
			<li>
				<Checkbox checked={selected} disabled={locked} onchange={() => toggle(permission.key)}>
					<span class="label">{permission.label}</span>
					<span class="description">
						{locked
							? 'You can only grant org permissions you hold yourself.'
							: permission.description}
					</span>
				</Checkbox>
			</li>
		{/each}
	</ul>
	{#snippet footer()}
		<Button variant="quiet" disabled={saving} onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" icon="check" loading={saving} onclick={save}>Save permissions</Button>
	{/snippet}
</Dialog>

<style>
	.permissions {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.label {
		display: block;
		font-weight: 600;
	}
	.description {
		display: block;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
