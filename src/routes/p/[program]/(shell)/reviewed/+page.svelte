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
		MultiFilter,
		Pagination,
		type DataTableColumn
	} from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { labelOf } from '$lib/data';
	import { pageHref, reviewHref } from '$lib/shipList';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns: DataTableColumn[] = [
		{ key: 'title', label: 'Project', width: '1.6fr', minWidth: '200px' },
		{ key: 'reviewerName', label: 'Reviewed by', width: '1fr', hideBelow: 'md' },
		{ key: 'author', label: 'Maker', width: '1fr', hideBelow: 'lg' },
		{ key: 'status', label: 'Decision', width: '130px' },
		{ key: 'approvedSeconds', label: 'Time', width: '110px', align: 'end', hideBelow: 'sm' }
	];

	const showTrack = $derived(data.orgWide || data.isPoc || data.bothTracks);
	const filtering = $derived(data.decisions.length > 0 || data.track !== null);

	// reverts and requeues have no review row behind them, so there is nothing to resend
	const canResend = $derived(data.permissions.includes('OVERRIDE_DECISIONS'));
	let resending = $state<string | null>(null);

	async function resend(id: string) {
		if (resending) return;
		resending = id;
		const result = await submitAction(
			'resend',
			{ id },
			{ invalidate: false, errorToast: true, fallbackMessage: 'Could not resend the webhook' }
		);
		if (result.ok) toast.success('Webhook resent', { icon: 'refresh' });
		resending = null;
	}
</script>

<svelte:head><title>{data.program} · Reviewed · Ari</title></svelte:head>

<PageHeader title="Reviewed" description="Every decided ship, newest first.">
	{#snippet actions()}
		{#each data.tallies as tally (tally.status)}
			{#if tally.count || tally.status !== 'reverted'}
				<Badge tone={tally.status} dot>{tally.count} {labelOf(tally.status).toLowerCase()}</Badge>
			{/if}
		{/each}
	{/snippet}
</PageHeader>

<ShipListFilters track={data.track} {showTrack} clearable={filtering} clearKeys={['decision']}>
	{#snippet lead()}
		<MultiFilter
			label="Decision"
			options={data.tallies.map((tally) => ({ value: tally.status, label: labelOf(tally.status) }))}
			bind:selected={
				() => data.decisions, (next) => applyListParams({ decision: next.join(',') || null })
			}
		/>
	{/snippet}
</ShipListFilters>

<Card padded={false}>
	<DataTable
		flush
		label="Reviewed ships"
		{columns}
		rows={data.rows}
		rowKey={(row) => row.id}
		rowHref={(row) => reviewHref(data.programId, row.id, null)}
		rowLabel={(row) => `Open ${row.title}`}
		rowActions={canResend ? rowActions : undefined}
	>
		{#snippet cell({ row, column })}
			{#if column.key === 'title'}
				<ShipTitleCell id={row.id} title={row.title} track={row.track} thumb={row.thumb} />
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
			{:else if column.key === 'status'}
				<StatusBadge status={row.status} />
			{:else}
				<ShipTimeCell seconds={row.approvedSeconds} />
			{/if}
		{/snippet}
		{#snippet empty()}
			<EmptyState title="Nothing reviewed in this filter yet" icon="checkCircle">
				{#if filtering}
					Try a different decision or track.
				{:else}
					Decided ships show up here.
				{/if}
				{#snippet actions()}
					{#if filtering}
						<Button onclick={() => applyListParams({ decision: null, track: null })}>
							Clear filters
						</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/snippet}
	</DataTable>
	<Pagination
		page={data.page}
		total={data.total}
		hrefFor={(target) => pageHref(page.url, target)}
		label="Reviewed pages"
	/>
</Card>

{#snippet rowActions(row: PageData['rows'][number])}
	{#if row.status !== 'reverted'}
		<Button
			size="sm"
			icon="refresh"
			loading={resending === row.id}
			disabled={resending !== null}
			title="Resend the outbound webhook for this decision"
			onclick={() => resend(row.id)}
		>
			Resend
		</Button>
	{/if}
{/snippet}
