<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import ShipListFilters from '$lib/components/app/ships/ShipListFilters.svelte';
	import ShipPersonCell from '$lib/components/app/ships/ShipPersonCell.svelte';
	import ShipTimeCell from '$lib/components/app/ships/ShipTimeCell.svelte';
	import ShipTitleCell from '$lib/components/app/ships/ShipTitleCell.svelte';
	import { applyListParams } from '$lib/components/app/ships/listNavigation';
	import {
		Badge,
		Button,
		Card,
		DataTable,
		EmptyState,
		Icon,
		Pagination,
		SegmentedControl,
		Tooltip,
		type DataTableColumn
	} from '$lib/components/ui';
	import { pageHref, reviewHref } from '$lib/shipList';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Project', width: '2.6fr', minWidth: '220px' },
		{ key: 'author', label: 'Maker', width: '1.5fr', hideBelow: 'md' },
		{ key: 'ago', label: 'Waiting', width: '130px', align: 'end' }
	];

	// org-wide viewers and the poc are unscoped, so they always get the track filter
	const showTrack = $derived(data.orgWide || data.isPoc || data.bothTracks);
</script>

<svelte:head><title>{data.program} · Needs review · Ari</title></svelte:head>

<PageHeader
	title="Needs review"
	description="Ships waiting for a decision, priority requests first, then oldest."
>
	{#snippet actions()}
		{#if data.startId}
			<Button
				variant="primary"
				icon="play"
				href={reviewHref(data.programId, data.startId, data.track)}
			>
				Start reviewing
			</Button>
		{/if}
	{/snippet}
</PageHeader>

<ShipListFilters track={data.track} {showTrack}>
	<SegmentedControl
		label="Sort"
		size="sm"
		options={[
			{ value: 'oldest', label: 'Oldest' },
			{ value: 'hours', label: 'Hours' }
		]}
		bind:value={
			() => data.sort, (next) => applyListParams({ sort: next === 'oldest' ? null : next })
		}
	/>
	<span class="showing">Showing <b>{data.total}</b> of {data.pending}</span>
</ShipListFilters>

<Card padded={false}>
	<DataTable
		flush
		label="Ships needing review"
		{columns}
		rows={data.rows}
		rowKey={(row) => row.id}
		rowHref={(row) => reviewHref(data.programId, row.id, data.track)}
		rowLabel={(row) => `Review ${row.title}`}
	>
		{#snippet cell({ row, column })}
			{#if column.key === 'title'}
				<ShipTitleCell id={row.id} title={row.title} track={row.track} thumb={row.thumb}>
					{#if row.priority}
						<Tooltip text="The maker requested priority review">
							<Badge tone="pending"><Icon name="star" size={11} /> Priority</Badge>
						</Tooltip>
					{/if}
					{#if row.isUpdate}
						<Badge><Icon name="refresh" size={11} /> Update</Badge>
					{/if}
					{#if row.claim}
						<Tooltip
							text={row.claim.mine
								? 'You have this ship open'
								: `${row.claim.byName} is reviewing this ship`}
						>
							<Badge tone={row.claim.mine ? 'secondpass' : 'changes'}>
								<Icon name="lock" size={11} />
								{row.claim.mine ? 'You' : row.claim.byName}
							</Badge>
						</Tooltip>
					{/if}
				</ShipTitleCell>
			{:else if column.key === 'author'}
				<ShipPersonCell
					name={row.author}
					color={row.color}
					slackId={row.authorSlackId}
					collaborators={row.collaborators}
				/>
			{:else}
				<ShipTimeCell seconds={row.evidenceSeconds} label="logged" lead={row.ago} />
			{/if}
		{/snippet}
		{#snippet empty()}
			{#if data.track}
				<EmptyState title="No submissions in this filter" icon="filter">
					Nothing on the {data.track} track is waiting right now.
					{#snippet actions()}
						<Button onclick={() => applyListParams({ track: null })}>Clear filter</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<EmptyState title="Queue zero. Nice." icon="checkCircle">
					Every {data.program} submission assigned to you has a decision. New ships land here on their
					own.
					{#snippet actions()}
						<Button variant="primary" icon="grid" href={`/p/${data.programId}`}>
							Back to overview
						</Button>
						<Button href="/programs">Switch program</Button>
					{/snippet}
				</EmptyState>
			{/if}
		{/snippet}
	</DataTable>
	<Pagination
		page={data.page}
		total={data.total}
		hrefFor={(target) => pageHref(page.url, target)}
		label="Queue pages"
	/>
</Card>

<style>
	.showing {
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.showing b {
		color: var(--text);
	}
</style>
