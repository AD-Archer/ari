<script lang="ts">
	import { page as appPage } from '$app/state';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import {
		Button,
		Card,
		Dropdown,
		EmptyState,
		List,
		MultiFilter,
		Notice,
		Pagination,
		SearchField,
		Skeleton,
		type DropdownItem
	} from '$lib/components/ui';
	import { tablePageSize } from '$lib/pagination';
	import { intParam, listParam, strParam } from '$lib/urlFilter.svelte';
	import ActivityRow from './components/ActivityRow.svelte';
	import {
		actionLabels,
		ageOptions,
		countBy,
		matchesFilter,
		systemActor,
		type ActivityLog
	} from './activityTypes';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const actionFilter = listParam('action');
	const userFilter = listParam('user');
	const maxAge = intParam('age', null);
	const search = strParam('q', '');
	// one-based in the url
	const pageParam = intParam('page', 1);

	let log = $state<ActivityLog | null>(null);
	let failed = $state(false);
	$effect(() => {
		let stale = false;
		data.events.then(
			(loaded) => {
				if (stale) return;
				log = loaded;
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

	const entries = $derived(log?.rows ?? []);
	const capped = $derived(log !== null && entries.length < log.total);

	const actionCounts = $derived(countBy(entries, (entry) => entry.action));
	const actionOptions = $derived(
		actionLabels
			.filter((label) => actionCounts[label])
			.map((label) => ({ value: label, label: `${label} (${actionCounts[label]})` }))
	);
	const userCounts = $derived(countBy(entries, (entry) => entry.actorName || systemActor));
	const userOptions = $derived([
		...Object.keys(userCounts)
			.filter((name) => name !== systemActor)
			.sort()
			.map((name) => ({ value: name, label: `${name} (${userCounts[name]})` })),
		...(userCounts[systemActor]
			? [{ value: systemActor, label: `System events (${userCounts[systemActor]})` }]
			: [])
	]);

	const ageLabel = $derived(
		ageOptions.find((option) => option.days === maxAge.value)?.label ?? 'All time'
	);
	const ageItems = $derived<DropdownItem[]>(
		ageOptions.map((option) => ({
			label: option.label,
			selected: option.days === maxAge.value,
			onSelect: () => (maxAge.value = option.days)
		}))
	);

	const anyFilter = $derived(
		actionFilter.value.length > 0 ||
			userFilter.value.length > 0 ||
			maxAge.value !== null ||
			search.value.trim() !== ''
	);
	const filtered = $derived(
		entries.filter((entry) =>
			matchesFilter(entry, {
				actions: actionFilter.value,
				users: userFilter.value,
				maxAgeDays: maxAge.value,
				search: search.value
			})
		)
	);
	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / tablePageSize())));
	const pageIndex = $derived(Math.max((pageParam.value ?? 1) - 1, 0));
	const shown = $derived(
		filtered.slice(pageIndex * tablePageSize(), (pageIndex + 1) * tablePageSize())
	);

	// a filter change can leave the page past the end
	$effect(() => {
		if (log && pageIndex > pageCount - 1) pageParam.value = 1;
	});

	function clearAll() {
		actionFilter.value = [];
		userFilter.value = [];
		maxAge.value = null;
		search.value = '';
		pageParam.value = 1;
	}

	const showsAll = $derived(appPage.url.searchParams.get('all') === '1');
	function queryWith(all: boolean): string {
		const entries: [string, string][] = [];
		if (search.value) entries.push(['q', search.value]);
		if (actionFilter.value.length) entries.push(['action', actionFilter.value.join(',')]);
		if (userFilter.value.length) entries.push(['user', userFilter.value.join(',')]);
		if (maxAge.value !== null) entries.push(['age', String(maxAge.value)]);
		if (pageIndex > 0) entries.push(['page', String(pageIndex + 1)]);
		if (all) entries.push(['all', '1']);
		const query = new URLSearchParams(entries).toString();
		return query ? `?${query}` : '';
	}
	// the review screen offers a one-click return to this exact view
	const backQuery = $derived(
		`back=${encodeURIComponent(`/p/${data.programId}/activity${queryWith(showsAll)}`)}`
	);
</script>

<svelte:head><title>{data.program} · Audit log · Ari</title></svelte:head>

<PageHeader title="Audit log" description="Review decisions and admin changes in {data.program}." />

<div class="toolbar">
	<div class="search">
		<SearchField label="Search activity" placeholder="Search activity…" bind:value={search.value} />
	</div>
	<MultiFilter
		label="Actions"
		icon="filter"
		options={actionOptions}
		bind:selected={actionFilter.value}
	/>
	<MultiFilter label="Users" icon="user" options={userOptions} bind:selected={userFilter.value} />
	<Dropdown label={ageLabel} icon="calendar" items={ageItems} />
	{#if anyFilter}
		<Button variant="quiet" size="sm" icon="x" onclick={clearAll}>Clear</Button>
	{/if}
	<span class="count" role="status">
		{#if log}{filtered.length} event{filtered.length === 1 ? '' : 's'}{/if}
	</span>
</div>

{#if capped && log}
	<Notice>
		<div class="capped">
			<span>
				Showing the latest {entries.length} of {log.total} events. Filters and search cover this window.
			</span>
			<Button size="sm" href={queryWith(true)}>Load full history</Button>
		</div>
	</Notice>
{/if}

{#if failed}
	<Notice tone="danger">The audit log could not be loaded. Reload the page to try again.</Notice>
{:else if !log}
	<Card>
		<div class="loading" role="status" aria-label="Loading the audit log">
			{#each { length: 7 }, index (index)}
				<!-- widths cycle between 45% and 85% so the rows do not look like a solid block -->
				<Skeleton width={`${45 + ((index * 17) % 41)}%`} />
			{/each}
		</div>
	</Card>
{:else if shown.length === 0}
	<Card>
		<EmptyState
			title={anyFilter ? 'No activity matches your filters' : 'No activity yet'}
			icon="clock"
		>
			{anyFilter
				? 'Try a wider date range or fewer filters.'
				: 'Review decisions and admin changes will show up here.'}
			{#snippet actions()}
				{#if anyFilter}<Button size="sm" icon="x" onclick={clearAll}>Clear filters</Button>{/if}
			{/snippet}
		</EmptyState>
	</Card>
{:else}
	<List aria-label="Audit log">
		{#each shown as entry (entry.id)}
			<ActivityRow {entry} {backQuery} />
		{/each}
	</List>
	{#if filtered.length > tablePageSize()}
		<Pagination
			label="Audit log pages"
			page={pageIndex}
			total={filtered.length}
			onPageChange={(target) => (pageParam.value = target + 1)}
		/>
	{/if}
{/if}

<style>
	.toolbar {
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
	.capped {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
</style>
