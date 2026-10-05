<script lang="ts">
	import StatusBadge from '$lib/components/app/StatusBadge.svelte';
	import ShipTimeCell from '$lib/components/app/ships/ShipTimeCell.svelte';
	import ShipTitleCell from '$lib/components/app/ships/ShipTitleCell.svelte';
	import { DataTable, EmptyState, type DataTableColumn } from '$lib/components/ui';
	import { reviewHref } from '$lib/shipList';
	import type { PageData } from '../$types';
	import Section from './Section.svelte';

	interface Props {
		reviews: PageData['recent'];
		programId: string;
		program: string;
		rangeActive: boolean;
	}
	let { reviews, programId, program, rangeActive }: Props = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Project', width: '1.6fr', minWidth: '200px' },
		{ key: 'decision', label: 'Decision', width: '130px' },
		{ key: 'approvedSeconds', label: 'Time', width: '110px', align: 'end', hideBelow: 'sm' },
		{ key: 'when', label: 'Decided', width: '150px', hideBelow: 'md' }
	];
</script>

<Section title={rangeActive ? 'Reviews in period' : 'Recent reviews'} icon="checkCircle" flush>
	<DataTable
		flush
		label={rangeActive ? 'Reviews in period' : 'Recent reviews'}
		stickyHeader={false}
		{columns}
		rows={reviews}
		rowKey={(row) => row.id}
		rowHref={(row) => reviewHref(programId, row.submissionId, null)}
		rowLabel={(row) => `Open ${row.title}`}
	>
		{#snippet cell({ row, column })}
			{#if column.key === 'title'}
				<ShipTitleCell
					id={row.submissionId}
					title={row.title}
					track={row.track}
					thumb={row.thumb}
				/>
			{:else if column.key === 'decision'}
				<StatusBadge status={row.decision} />
			{:else if column.key === 'approvedSeconds'}
				<ShipTimeCell seconds={row.approvedSeconds} />
			{:else}
				<span class="when" title={row.ago}>{row.when}</span>
			{/if}
		{/snippet}
		{#snippet empty()}
			<EmptyState
				title={rangeActive ? 'No reviews in this period' : `No reviews on ${program} yet`}
				icon="checkCircle"
			/>
		{/snippet}
	</DataTable>
</Section>

<style>
	.when {
		font-size: var(--text-xs);
		color: var(--text-2);
	}
</style>
