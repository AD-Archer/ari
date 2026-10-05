<script lang="ts">
	import { Button, ConfirmDialog } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { toast } from '$lib/toast.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	interface Props {
		programName: string;
		archived: boolean;
	}
	let { programName, archived }: Props = $props();

	let confirmOpen = $state(false);
	let restoring = $state(false);

	async function archive() {
		const result = await submitAction(
			'archive',
			{},
			{ fallbackMessage: 'Could not archive program' }
		);
		if (!result.ok) throw new Error(result.message);
		toast.success(`${programName} archived, no longer accepting ships`, { icon: 'lock' });
	}

	async function restore() {
		if (restoring) return;
		restoring = true;
		const result = await submitAction(
			'unarchive',
			{},
			{ errorToast: true, fallbackMessage: 'Could not restore program' }
		);
		restoring = false;
		if (result.ok) toast.success(`${programName} restored, accepting ships again`);
	}
</script>

<SettingSection title="Danger zone" description="Actions for sunsetting a program.">
	<div class={['panel', !archived && 'danger']}>
		<div class="copy">
			{#if archived}
				<strong>This program is archived</strong>
				<span>
					It's hidden from reviewers and rejects new ships. Restore it to make it active again.
				</span>
			{:else}
				<strong>Archive this program</strong>
				<span>
					Puts the program in a read-only state and removes it from the dashboard list. New ships
					are rejected. You can restore it later.
				</span>
			{/if}
		</div>
		{#if archived}
			<Button variant="soft" size="sm" icon="refresh" loading={restoring} onclick={restore}>
				Restore program
			</Button>
		{:else}
			<Button variant="danger" size="sm" icon="lock" onclick={() => (confirmOpen = true)}>
				Archive program
			</Button>
		{/if}
	</div>
</SettingSection>

<ConfirmDialog
	bind:open={confirmOpen}
	title={`Archive ${programName}?`}
	icon="lock"
	tone="danger"
	confirmLabel="Archive"
	onConfirm={archive}
>
	<p class="confirm">
		Reviewers lose access and new ships are rejected until you restore the program.
	</p>
</ConfirmDialog>

<style>
	.panel {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-md);
	}
	.danger {
		border-color: color-mix(in srgb, var(--accent-red) 35%, transparent);
	}
	.copy {
		display: flex;
		flex: 1 1 240px;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	strong {
		color: var(--text);
	}
	.confirm {
		margin: 0;
		color: var(--text-2);
	}
</style>
