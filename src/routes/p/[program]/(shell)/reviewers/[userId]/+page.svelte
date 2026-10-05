<script lang="ts">
	import { Tabs, type IconName } from '$lib/components/ui';
	import { strParam } from '$lib/urlFilter.svelte';
	import CrossProgramTable from './components/CrossProgramTable.svelte';
	import DateRangeFilter from './components/DateRangeFilter.svelte';
	import NotesPanel from './components/NotesPanel.svelte';
	import PermissionsEditor from './components/PermissionsEditor.svelte';
	import RecentReviews from './components/RecentReviews.svelte';
	import ReviewerHeader from './components/ReviewerHeader.svelte';
	import SessionList from './components/SessionList.svelte';
	import StatTiles from './components/StatTiles.svelte';
	import VmList from './components/VmList.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type ProfileTab = 'overview' | 'permissions' | 'notes';
	const tabParam = strParam<ProfileTab>('tab', 'overview');
	const tabs = $derived<{ value: ProfileTab; label: string; icon: IconName }[]>([
		{ value: 'overview', label: 'Overview', icon: 'grid' },
		...(data.canManage
			? [{ value: 'permissions' as const, label: 'Permissions', icon: 'shield' as const }]
			: []),
		...(data.canSeeNotes
			? [{ value: 'notes' as const, label: 'Internal notes', icon: 'book' as const }]
			: [])
	]);
	// a tab the viewer may not open falls back to the overview
	const activeTab = $derived(
		tabs.some((entry) => entry.value === tabParam.value) ? tabParam.value : 'overview'
	);

	const program = $derived(data.program ?? '');
	const programId = $derived(data.programId ?? '');
</script>

<svelte:head><title>{data.subject.name} · Reviewers · Ari</title></svelte:head>

<ReviewerHeader subject={data.subject} {programId} />

<Tabs
	{tabs}
	label="Reviewer profile sections"
	bind:value={() => activeTab, (next) => (tabParam.value = next)}
/>

{#if activeTab === 'overview'}
	<DateRangeFilter range={data.range} />
	<StatTiles
		stats={data.stats}
		goal={data.meta?.reviewGoal ?? 50}
		rangeActive={data.range.active}
	/>
	{#if data.crossProgram}
		<CrossProgramTable crossProgram={data.crossProgram} subjectId={data.subject.id} />
	{/if}
	<div class="columns">
		<RecentReviews reviews={data.recent} {programId} {program} rangeActive={data.range.active} />
		<VmList vms={data.vms} {programId} {program} rangeActive={data.range.active} />
	</div>
	<SessionList sessions={data.sessions} {programId} rangeActive={data.range.active} />
{:else if activeTab === 'permissions'}
	<PermissionsEditor
		subject={data.subject}
		{program}
		{programId}
		isSelf={data.user?.id === data.subject.id}
		orgOperator={data.orgOperator}
	/>
{:else}
	<NotesPanel notes={data.notes} subjectName={data.subject.name} orgOperator={data.orgOperator} />
{/if}

<style>
	.columns {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4);
	}
	@media (max-width: 1000px) {
		.columns {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
