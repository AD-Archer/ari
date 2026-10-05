<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import StatusBadge from '$lib/components/app/StatusBadge.svelte';
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
		Tooltip,
		type DataTableColumn
	} from '$lib/components/ui';
	import { pageHref, reviewHref } from '$lib/shipList';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Project', width: '1.5fr', minWidth: '170px' },
		{ key: 'decision', label: 'Held decision', width: '120px' },
		{ key: 'reviewerName', label: 'Reviewed by', width: '1fr', hideBelow: 'md' },
		{ key: 'author', label: 'Maker', width: '1fr', hideBelow: 'lg' },
		{ key: 'approvedSeconds', label: 'Time', width: '110px', align: 'end', hideBelow: 'sm' }
	];
</script>

<svelte:head><title>{data.program} · Second pass · Ari</title></svelte:head>

<PageHeader
	title="Second pass"
	description="Decisions held for an organizer. Open a ship to confirm it or send it back."
/>

{#if data.bothTracks || data.track}
	<ShipListFilters track={data.track} showTrack />
{/if}

<Card padded={false}>
	<DataTable
		flush
		label="Decisions awaiting second pass"
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
				</ShipTitleCell>
			{:else if column.key === 'decision'}
				<StatusBadge status={row.decision} />
			{:else if column.key === 'reviewerName'}
				<ShipPersonCell
					name={row.reviewerName}
					color={row.reviewerColor}
					slackId={row.reviewerSlackId}
					detail={row.when}
				/>
			{:else if column.key === 'author'}
				<ShipPersonCell
					name={row.author}
					color={row.color}
					slackId={row.authorSlackId}
					collaborators={row.collaborators}
				/>
			{:else}
				<ShipTimeCell seconds={row.approvedSeconds} />
			{/if}
		{/snippet}
		{#snippet rowActions(row)}
			<Button
				variant="primary"
				size="sm"
				iconAfter="arrowR"
				href={reviewHref(data.programId, row.id, data.track)}
			>
				Review
			</Button>
		{/snippet}
		{#snippet empty()}
			<EmptyState title="Nothing waiting on second pass" icon="checkCircle">
				{#if data.track && data.heldTotal}
					No held decisions on the {data.track} track.
				{:else}
					Held decisions land here until an organizer confirms them.
				{/if}
				{#snippet actions()}
					{#if data.track}
						<Button onclick={() => applyListParams({ track: null })}>Clear filter</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/snippet}
	</DataTable>
	<Pagination
		page={data.page}
		total={data.total}
		hrefFor={(target) => pageHref(page.url, target)}
		label="Second pass pages"
	/>
</Card>
