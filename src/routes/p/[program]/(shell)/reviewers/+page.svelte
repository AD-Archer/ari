<script lang="ts">
	import { tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page as appPage } from '$app/state';
	import { submitAction } from '$lib/actions';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import {
		Button,
		ConfirmDialog,
		DataTable,
		Dropdown,
		EmptyState,
		Notice,
		Pagination,
		SearchField,
		type DataTableColumn,
		type DropdownItem
	} from '$lib/components/ui';
	import { tablePageSize } from '$lib/pagination';
	import { toast } from '$lib/toast.svelte';
	import { intParam, strParam } from '$lib/urlFilter.svelte';
	import AddReviewersDialog from './components/AddReviewersDialog.svelte';
	import EditAccessDialog from '$lib/components/app/reviewers/EditAccessDialog.svelte';
	import RosterCell from './components/RosterCell.svelte';
	import type { RosterRow } from './rosterTypes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let people = $state<RosterRow[] | null>(null);
	let failed = $state(false);
	$effect(() => {
		let stale = false;
		data.reviewers.then(
			(loaded) => {
				if (stale) return;
				people = loaded;
				failed = false;
			},
			() => {
				if (!stale) failed = true;
			}
		);
		return () => {
			stale = true;
		};
	});

	const search = strParam('q', '');
	// one-based in the url
	const pageParam = intParam('page', 1);
	const shown = $derived.by(() => {
		const term = search.value.trim().toLowerCase();
		const all = people ?? [];
		if (!term) return all;
		return all.filter(
			(person) =>
				person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term)
		);
	});
	const pageCount = $derived(Math.max(1, Math.ceil(shown.length / tablePageSize())));
	const pageIndex = $derived(Math.max((pageParam.value ?? 1) - 1, 0));
	const rows = $derived(
		shown.slice(pageIndex * tablePageSize(), (pageIndex + 1) * tablePageSize())
	);
	$effect(() => {
		if (people && pageIndex > pageCount - 1) pageParam.value = 1;
	});

	const columns = $derived<DataTableColumn[]>([
		{ key: 'person', label: 'Reviewer', width: '2fr', minWidth: '190px' },
		{ key: 'access', label: 'Access', width: '1.4fr', hideBelow: 'lg' },
		{ key: 'week', label: `This week · goal ${data.goal}`, width: '1.4fr', minWidth: '150px' },
		{ key: 'approval', label: 'Approval', width: '90px', hideBelow: 'md' },
		{ key: 'lastSeen', label: 'Last active', width: '110px', hideBelow: 'md' }
	]);

	// the server refuses self-removal, and only an org operator may touch the program poc
	const canRemove = (row: RosterRow) =>
		data.canManage && row.email !== data.user?.email && (!row.isPoc || data.orgOperator);
	const canEdit = (row: RosterRow) =>
		data.canManage && !row.pending && !!row.userId && !row.isPoc && row.email !== data.user?.email;

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editing = $state<RosterRow | null>(null);
	let removeOpen = $state(false);
	let removing = $state<RosterRow | null>(null);

	function menuFor(row: RosterRow): DropdownItem[] {
		const items: DropdownItem[] = [];
		if (canEdit(row))
			items.push({
				label: 'Edit access',
				icon: 'shield',
				onSelect: () => {
					editing = row;
					editOpen = true;
				}
			});
		if (canRemove(row))
			items.push({
				label: row.pending ? 'Revoke invite' : 'Remove from program',
				icon: 'x',
				tone: 'danger',
				separatorBefore: items.length > 0,
				onSelect: () => {
					removing = row;
					removeOpen = true;
				}
			});
		return items;
	}

	async function remove() {
		const target = removing;
		if (!target) return false;
		const result = await submitAction(
			'remove',
			{ email: target.email },
			{ errorToast: true, fallbackMessage: 'Could not remove reviewer' }
		);
		if (!result.ok) return false;
		toast.success(
			target.pending
				? `Invite to ${target.email} revoked`
				: `${target.name} removed from ${data.program}`
		);
	}

	// deep link from search (?focus=email): jump to that reviewer's page, scroll to and flash
	// the row once, then drop the param so a refresh does not replay it
	let flashEmail = $state('');
	let lastFocus = '';
	$effect(() => {
		const focus = appPage.url.searchParams.get('focus');
		if (!focus) {
			lastFocus = '';
			return;
		}
		if (!people?.length || lastFocus === focus) return;
		lastFocus = focus;
		const position = shown.findIndex((person) => person.email === focus);
		if (position >= 0) pageParam.value = Math.floor(position / tablePageSize()) + 1;
		flashEmail = focus;
		tick().then(() => {
			document
				.querySelector(`[data-reviewer-email="${CSS.escape(focus)}"]`)
				?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			const entries = [...new URLSearchParams(location.search)].filter(
				([name]) => name !== 'focus'
			);
			const query = new URLSearchParams(entries).toString();
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current pathname is already resolved
			replaceState(query ? `${location.pathname}?${query}` : location.pathname, appPage.state);
		});
	});
</script>

<svelte:head><title>{data.program} · Reviewers · Ari</title></svelte:head>

<PageHeader
	title="Reviewers"
	description={people
		? `${people.length} reviewer${people.length === 1 ? '' : 's'} on ${data.program}`
		: `Who reviews ${data.program}`}
>
	{#snippet actions()}
		<div class="search">
			<SearchField
				label="Search reviewers"
				placeholder="Search reviewers…"
				bind:value={search.value}
			/>
		</div>
		{#if data.canManage}
			<Button variant="primary" icon="plus" onclick={() => (addOpen = true)}>Add reviewer</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if failed}
	<Notice tone="danger">The roster could not be loaded. Reload the page to try again.</Notice>
{:else}
	<DataTable
		label="Reviewers"
		{columns}
		{rows}
		rowKey={(row) => row.email}
		rowHref={(row) =>
			row.pending || !row.userId ? undefined : `/p/${data.programId}/reviewers/${row.userId}`}
		rowLabel={(row) => `Open ${row.name}'s profile`}
		loading={!people}
		loadingRows={5}
		stickyHeader={false}
	>
		{#snippet cell({ row, column })}
			<RosterCell
				{row}
				columnKey={column.key}
				goal={data.goal ?? 0}
				flash={flashEmail === row.email}
			/>
		{/snippet}
		{#snippet rowActions(row)}
			{@const items = menuFor(row)}
			{#if items.length}
				<Dropdown {items} align="end">
					{#snippet trigger(triggerProps)}
						<Button
							variant="quiet"
							size="sm"
							icon="dots"
							aria-label="Actions for {row.name}"
							{...triggerProps}
						/>
					{/snippet}
				</Dropdown>
			{/if}
		{/snippet}
		{#snippet empty()}
			<EmptyState
				title={search.value.trim()
					? `No reviewers match “${search.value.trim()}”`
					: 'No reviewers on this program yet'}
				icon="user"
			>
				{#snippet actions()}
					{#if search.value.trim()}
						<Button size="sm" icon="x" onclick={() => (search.value = '')}>Clear search</Button>
					{:else if data.canManage}
						<Button size="sm" variant="primary" icon="plus" onclick={() => (addOpen = true)}>
							Add reviewer
						</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/snippet}
	</DataTable>
	{#if shown.length > tablePageSize()}
		<Pagination
			label="Reviewer pages"
			page={pageIndex}
			total={shown.length}
			onPageChange={(target) => (pageParam.value = target + 1)}
		/>
	{/if}
{/if}

{#if data.canManage}
	<AddReviewersDialog
		bind:open={addOpen}
		program={data.program ?? ''}
		programId={data.programId ?? ''}
	/>
	<EditAccessDialog bind:open={editOpen} member={editing} />
	<ConfirmDialog
		bind:open={removeOpen}
		tone="danger"
		icon="x"
		title={removing?.pending ? 'Revoke this invite?' : 'Remove this reviewer?'}
		description={removing?.pending
			? `${removing.email} will no longer be able to join ${data.program}.`
			: `${removing?.name ?? ''} loses access to ${data.program}. Their past reviews stay.`}
		confirmLabel={removing?.pending ? 'Revoke invite' : 'Remove'}
		onConfirm={remove}
	/>
{/if}

<style>
	.search {
		width: 240px;
		max-width: 100%;
	}
</style>
