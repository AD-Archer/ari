<script lang="ts">
	import { page as appPage } from '$app/state';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import {
		Badge,
		Button,
		Card,
		DataTable,
		EmptyState,
		Icon,
		MultiFilter,
		Notice,
		Pagination,
		SearchField,
		Swatch,
		type DataTableColumn
	} from '$lib/components/ui';
	import { tablePageSize } from '$lib/pagination';
	import { intParam, listParam, strParam } from '$lib/urlFilter.svelte';
	import EventDialog from './components/EventDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const programs = listParam('program');
	const types = listParam('type');
	const query = strParam<string>('q', '');
	const pageNumber = intParam('page', 1);
	const openEvent = strParam<string>('event', '');

	const allHref = $derived.by(() => {
		const target = new URL(appPage.url);
		target.searchParams.set('all', '1');
		return `${target.pathname}${target.search}`;
	});

	const countBy = (pick: (event: PageData['events'][number]) => string) => {
		const counts: Record<string, number> = {};
		for (const event of data.events) counts[pick(event)] = (counts[pick(event)] ?? 0) + 1;
		return counts;
	};
	const programCounts = $derived(countBy((event) => event.program));
	const typeCounts = $derived(countBy((event) => event.action));
	const programColors = $derived(
		new Map(data.events.map((event) => [event.program, event.programColor]))
	);
	const programOptions = $derived(
		Object.keys(programCounts)
			.sort()
			.map((name) => ({
				value: name,
				label: `${name} (${programCounts[name]})`,
				color: programColors.get(name)
			}))
	);
	const typeOptions = $derived(
		['Ingest', 'Delivery', 'Evidence']
			.filter((type) => typeCounts[type])
			.map((type) => ({ value: type, label: `${type} (${typeCounts[type]})` }))
	);

	const needle = $derived(query.value.trim().toLowerCase());
	const anyFilter = $derived(programs.value.length > 0 || types.value.length > 0 || needle !== '');
	const filtered = $derived(
		data.events.filter(
			(event) =>
				(programs.value.length === 0 || programs.value.includes(event.program)) &&
				(types.value.length === 0 || types.value.includes(event.action)) &&
				(needle === '' ||
					`${event.program} ${event.text} ${event.detail} ${event.submissionId}`
						.toLowerCase()
						.includes(needle))
		)
	);
	const lastPage = $derived(Math.max(Math.ceil(filtered.length / tablePageSize()) - 1, 0));
	const currentPage = $derived(Math.min(Math.max((pageNumber.value ?? 1) - 1, 0), lastPage));
	const rows = $derived(
		filtered.slice(currentPage * tablePageSize(), (currentPage + 1) * tablePageSize())
	);
	const selected = $derived(data.events.find((event) => event.id === openEvent.value) ?? null);

	const columns: DataTableColumn[] = [
		{ key: 'action', label: 'Type', width: '120px' },
		{ key: 'program', label: 'Program', width: '150px', hideBelow: 'md' },
		{ key: 'text', label: 'Event', width: '3fr' },
		{ key: 'when', label: 'When', width: '90px', align: 'end', hideBelow: 'sm' }
	];

	function clearAll() {
		programs.value = [];
		types.value = [];
		query.value = '';
		pageNumber.value = 1;
	}
</script>

<svelte:head><title>Webhooks · Admin · Ari</title></svelte:head>

<PageHeader
	title="Webhook logs"
	description="Ship ingest, outbound sends and evidence capture across every program, newest first."
/>

<div class="filters">
	<div class="search">
		<SearchField
			label="Search webhook logs"
			placeholder="Search webhook logs…"
			bind:value={
				() => query.value,
				(next) => {
					query.value = next;
					pageNumber.value = 1;
				}
			}
		/>
	</div>
	<MultiFilter
		label="Programs"
		icon="grid"
		options={programOptions}
		bind:selected={
			() => programs.value,
			(next) => {
				programs.value = next;
				pageNumber.value = 1;
			}
		}
	/>
	<MultiFilter
		label="Type"
		options={typeOptions}
		bind:selected={
			() => types.value,
			(next) => {
				types.value = next;
				pageNumber.value = 1;
			}
		}
	/>
	{#if anyFilter}
		<Button variant="quiet" size="sm" icon="x" onclick={clearAll}>Clear</Button>
	{/if}
	<span class="count">{filtered.length} event{filtered.length === 1 ? '' : 's'}</span>
</div>

{#if data.capped}
	<Notice>
		Showing the latest {data.events.length} of {data.total} events. Filters and search cover this window.
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- built from the current, already-resolved url -->
		<a href={allHref}>Load full history</a>
	</Notice>
{/if}

<Card padded={false}>
	<DataTable label="Webhook logs" {columns} {rows} rowKey={(event) => event.id} flush>
		{#snippet cell({ row, column })}
			{#if column.key === 'action'}
				<Badge tone={row.tone}><Icon name={row.icon} size={12} /> {row.action}</Badge>
			{:else if column.key === 'program'}
				<Swatch color={row.programColor} size="sm" />
				<span class="truncate">{row.program}</span>
			{:else if column.key === 'text'}
				<div class="event">
					<span class="truncate">{row.text}</span>
					{#if row.detail || row.submissionId}
						<span class="meta truncate">
							{row.detail && row.submissionId ? `${row.detail} · ` : row.detail}
							{#if row.submissionId}<span class="mono">{row.submissionId}</span>{/if}
						</span>
					{/if}
				</div>
			{:else}
				<span class="meta" title={row.iso}>{row.when}</span>
			{/if}
		{/snippet}
		{#snippet rowActions(row)}
			<Button
				variant="quiet"
				size="sm"
				icon="info"
				aria-label={`Details for ${row.text}`}
				onclick={() => (openEvent.value = row.id)}
			>
				Details
			</Button>
		{/snippet}
		{#snippet empty()}
			<EmptyState
				title={data.events.length
					? 'No webhook logs match your filters'
					: 'No webhook activity yet'}
			>
				{#snippet actions()}
					{#if anyFilter}<Button size="sm" onclick={clearAll}>Clear filters</Button>{/if}
				{/snippet}
			</EmptyState>
		{/snippet}
	</DataTable>
</Card>

<Pagination
	page={currentPage}
	total={filtered.length}
	label="Webhook log pages"
	onPageChange={(next) => (pageNumber.value = next + 1)}
/>

<EventDialog event={selected} onClose={() => (openEvent.value = '')} />

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.search {
		flex: 1 1 220px;
		max-width: 320px;
	}
	.count {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.event {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta {
		font-size: var(--text-sm);
		color: var(--text-2);
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	a {
		color: var(--primary);
	}
</style>
