<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { Button, ConfirmDialog, EmptyState, Pagination } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { toast } from '$lib/toast.svelte';
	import { intParam } from '$lib/urlFilter.svelte';
	import ArchivedProgramList from './components/ArchivedProgramList.svelte';
	import ProgramCard from './components/ProgramCard.svelte';
	import ProgramWizardDialog from './components/ProgramWizardDialog.svelte';
	import type { BoardProgram } from './components/boardTypes';
	import { createProgramWizard } from './components/programWizard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// the create-only tier gets the board with just the create flow: the server refuses the rest
	const canManage = $derived((data.user?.orgPermissions ?? []).includes('MANAGE_PROGRAMS'));
	const live = $derived(data.programs.filter((program) => program.status !== 'ARCHIVED'));
	const archived = $derived(data.programs.filter((program) => program.status === 'ARCHIVED'));

	const pageNumber = intParam('page', 1);
	// 9 cards a page: three rows of the three-up grid
	const lastPage = $derived(Math.max(Math.ceil(live.length / 9) - 1, 0));
	const currentPage = $derived(Math.min(Math.max((pageNumber.value ?? 1) - 1, 0), lastPage));
	const shown = $derived(live.slice(currentPage * 9, (currentPage + 1) * 9));

	const wizard = createProgramWizard(
		() => canManage,
		() => data.user?.email ?? ''
	);

	let reingesting = $state<string | null>(null);
	let restoring = $state<string | null>(null);
	let archiveOpen = $state(false);
	let archiveTarget = $state<BoardProgram | null>(null);

	async function saved({ name, createdId }: { name: string; createdId: string | null }) {
		if (!createdId) {
			toast.success(`“${name}” saved`);
			return;
		}
		toast.success(`Program “${name}” created`, { icon: 'plus' });
		await goto(resolve('/p/[program]', { program: createdId }));
	}

	// safe to repeat: a ship whose capture is already queued is covered by that job
	async function reingest(program: BoardProgram) {
		if (reingesting) return;
		reingesting = program.id;
		const result = await submitAction<{ queued: number }>(
			'reingest',
			{ programId: program.id },
			{ errorToast: true, invalidate: false, fallbackMessage: 'Could not start re-ingestion' }
		);
		reingesting = null;
		if (!result.ok) return;
		const queued = result.data?.queued ?? 0;
		toast.info(
			queued > 0
				? `Re-ingestion started for ${queued} ${queued === 1 ? 'ship' : 'ships'} in ${program.name}`
				: `${program.name} has no ships waiting for review`,
			{ icon: 'refresh' }
		);
	}

	async function archive() {
		if (!archiveTarget) return;
		const target = archiveTarget;
		const result = await submitAction('archive', { programId: target.id });
		if (!result.ok) throw new Error(result.message);
		toast.success(`${target.name} archived`, { icon: 'checkCircle' });
	}

	async function restore(program: BoardProgram) {
		if (restoring) return;
		restoring = program.id;
		const result = await submitAction(
			'unarchive',
			{ programId: program.id },
			{ errorToast: true, fallbackMessage: 'Could not restore program' }
		);
		restoring = null;
		if (result.ok) toast.success(`${program.name} restored`, { icon: 'checkCircle' });
	}
</script>

<svelte:head><title>Programs · Admin · Ari</title></svelte:head>

<PageHeader title="Programs" description="Where the ships go at!">
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={wizard.openCreate}>New program</Button>
	{/snippet}
</PageHeader>

{#if live.length === 0}
	<EmptyState title="Create your first program" icon="grid">
		A program gets its own queue, reviewers, and webhook.
		{#snippet actions()}
			<Button variant="primary" icon="plus" onclick={wizard.openCreate}>New program</Button>
		{/snippet}
	</EmptyState>
{:else}
	<ul class="grid">
		{#each shown as program (program.id)}
			<li>
				<ProgramCard
					{program}
					{canManage}
					reingesting={reingesting === program.id}
					onEdit={() => wizard.openEdit(program)}
					onReingest={() => reingest(program)}
					onArchive={() => {
						archiveTarget = program;
						archiveOpen = true;
					}}
				/>
			</li>
		{/each}
	</ul>
	<Pagination
		page={currentPage}
		total={live.length}
		pageSize={9}
		label="Program pages"
		onPageChange={(next) => (pageNumber.value = next + 1)}
	/>
{/if}

{#if archived.length > 0}
	<ArchivedProgramList programs={archived} {canManage} {restoring} onRestore={restore} />
{/if}

<ProgramWizardDialog {wizard} people={data.people} onSaved={saved} />

<ConfirmDialog
	bind:open={archiveOpen}
	tone="danger"
	icon="checkCircle"
	title="Archive {archiveTarget?.name ?? 'program'}?"
	description="It drops out of the all-programs list and stops counting toward the org Slack channels. Its ships and history are kept, and it can be restored from the archived list."
	confirmLabel="Archive program"
	onConfirm={archive}
/>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	@media (max-width: 960px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 600px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
