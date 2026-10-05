<script lang="ts">
	import { privateProvider } from '$private';
	import { page } from '$app/state';
	import EvidenceDock from '$lib/components/review/dock/EvidenceDock.svelte';
	import { iconPaths, type IconName } from '$lib/components/ui/iconPaths';
	import { isDockTileId, type DockTileId } from '$lib/review/dockDefaults';
	import type { DockTileInput } from '$lib/review/dockState.svelte';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import { formatDuration } from '$lib/time';
	import CommitList from './CommitList.svelte';
	import DevlogList from './DevlogList.svelte';
	import FileBrowser from './FileBrowser.svelte';
	import LapseList from './LapseList.svelte';
	import PastProjectList from './PastProjectList.svelte';
	import PastReviewList from './PastReviewList.svelte';
	import ReadmePanel from './ReadmePanel.svelte';

	const { context, cursor, keybinds, settlement } = useReview();
	const data = $derived(context.data);
	const evidence = $derived(data.evidence);
	const accepts = $derived(page.data.meta?.accepts ?? []);

	let dock = $state<EvidenceDock>();

	const privateTiles = Object.entries(privateProvider.slots.reviewTiles).filter(
		(entry): entry is [DockTileId, (typeof entry)[1]] => isDockTileId(entry[0])
	);
	const privateTile = (id: DockTileId) => privateTiles.find(([tileId]) => tileId === id)?.[1];
	const shipRef = $derived({ submissionId: context.ship.id, programId: context.programId });

	// the tree only lists files the repository has: the rest is the private module's to show
	const fileRows = $derived(
		(data.fileHours ?? []).filter(
			(file) => file.status === 'head' || privateProvider.slots.reviewFileExtras
		)
	);

	// only tiles that carry something show. a ship with no evidence at all still gets the
	// program's accepted kinds, so the panel is never an empty bar
	const available = $derived.by(() => {
		const present = {
			commits: evidence.commits.length > 0,
			elapsed: evidence.clips.length > 0,
			devlog: evidence.devlogs.length > 0,
			files: fileRows.length > 0,
			history: data.pastReviews.length > 0,
			pastprojects: data.pastProjects.length > 0
		};
		if (context.isHardware) return { ...present, readme: Boolean(context.repoUrl) };
		const accepted = {
			...present,
			commits: present.commits && accepts.includes('commits'),
			elapsed: present.elapsed && accepts.includes('elapsed'),
			devlog: present.devlog && accepts.includes('devlog')
		};
		const readme = Boolean(context.repoUrl);
		if (Object.values(accepted).some(Boolean)) return { ...accepted, readme };
		return {
			...accepted,
			readme,
			commits: accepts.includes('commits'),
			elapsed: accepts.includes('elapsed'),
			devlog: accepts.includes('devlog'),
			history: true
		};
	});

	const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
	const settledOf = (source: 'journals' | 'lapse') =>
		settlement.sourceRows.find((row) => row.source === source)?.settledSeconds ?? 0;
	// "Devlog · 2 · 1h 15m": how many, then how much. the time is left off when there is none
	const counted = (name: string, count: number, seconds: number) =>
		[name, String(count), ...(seconds > 0 ? [formatDuration(seconds)] : [])].join(' · ');

	const tiles = $derived<DockTileInput[]>([
		{
			id: 'commits',
			label: counted(
				'Commits',
				evidence.commits.length,
				sum(
					evidence.commits.map((commit) =>
						settlement.rowSeconds('commits', commit.id, commit.codingSeconds)
					)
				)
			),
			icon: 'commit',
			available: available.commits,
			body: commitsBody
		},
		{
			id: 'elapsed',
			label: counted('Lapse', evidence.clips.length, settledOf('lapse')),
			icon: 'film',
			available: available.elapsed,
			body: elapsedBody
		},
		{
			id: 'devlog',
			label: counted('Devlog', evidence.devlogs.length, settledOf('journals')),
			icon: 'book',
			available: available.devlog,
			body: devlogBody
		},
		{ id: 'readme', label: 'README', icon: 'file', available: available.readme, body: readmeBody },
		{
			id: 'files',
			label: counted('Files', fileRows.length, sum(fileRows.map((file) => file.seconds))),
			icon: 'folder',
			available: available.files,
			body: filesBody
		},
		{
			id: 'history',
			label: `Past reviews · ${data.pastReviews.length}`,
			icon: 'clock',
			available: available.history,
			body: historyBody
		},
		{
			id: 'pastprojects',
			label: counted(
				'Past projects',
				data.pastProjects.length,
				sum(data.pastProjects.map((project) => project.creditedSeconds))
			),
			icon: 'layers',
			available: available.pastprojects,
			body: pastProjectsBody
		},
		...privateTiles.map(([id, tile]) => ({
			id,
			label: tile.label,
			icon: tile.icon && tile.icon in iconPaths ? (tile.icon as IconName) : undefined,
			// the private module sends data only for the tiles this ship and viewer get
			available: id in data.privatePanels,
			body: id === 'hackatime' ? hackatimeBody : aicheckBody
		}))
	]);

	const tabParam = $derived(page.url.searchParams.get('tab'));
	const requestedTile = $derived(
		isDockTileId(tabParam) ? { key: `${context.ship.id}:${tabParam}`, tile: tabParam } : null
	);

	// a new ship without a navigation still has to drop any gesture in progress
	$effect(() => {
		void context.ship.id;
		dock?.cancelInteractions();
	});

	const rowKeys = () =>
		Boolean(cursor.tile && isDockTileId(cursor.tile) && !dock?.isCollapsed(cursor.tile));

	$effect(() => {
		const dockShortcuts = dock?.shortcuts ?? [];
		return keybinds.registerShortcuts('evidence', [
			...dockShortcuts,
			{
				id: 'editTime',
				label: 'Edit selected time',
				defaultBinding: ' ',
				handler: () => {
					const input = cursor.currentTimeInput();
					if (!input) return false;
					input.focus();
					input.select();
				}
			},
			...(['up', 'down', 'left', 'right'] as const).map((direction) => ({
				id: `evidenceRow${direction}`,
				label: `Evidence row ${direction}`,
				defaultBinding: `Arrow${direction[0].toUpperCase()}${direction.slice(1)}`,
				fixed: true,
				when: rowKeys,
				handler: () => cursor.move(direction)
			})),
			{
				id: 'evidenceRowOpen',
				label: 'Open the selected evidence row',
				defaultBinding: 'Enter',
				fixed: true,
				when: rowKeys,
				handler: () => cursor.open()
			}
		]);
	});
</script>

{#snippet commitsBody()}<CommitList />{/snippet}
{#snippet elapsedBody()}<LapseList />{/snippet}
{#snippet devlogBody()}<DevlogList onReveal={() => dock?.showTile('devlog')} />{/snippet}
{#snippet readmeBody()}<ReadmePanel active={available.readme} />{/snippet}
{#snippet filesBody()}<FileBrowser />{/snippet}
{#snippet historyBody()}<PastReviewList />{/snippet}
{#snippet pastProjectsBody()}<PastProjectList />{/snippet}
{#snippet hackatimeBody()}
	{@const Tile = privateTile('hackatime')?.component}
	{#if Tile}<Tile ship={shipRef} />{/if}
{/snippet}
{#snippet aicheckBody()}
	{@const Tile = privateTile('aicheck')?.component}
	{#if Tile}<Tile ship={shipRef} />{/if}
{/snippet}

<section class="evidenceArea" data-review-region="evidence" aria-label="Evidence">
	<EvidenceDock
		bind:this={dock}
		{tiles}
		{requestedTile}
		scope={{ userId: context.user?.id, programId: context.programId, track: context.ship.track }}
		shortcutLabel={(index) => (index >= 0 && index < 9 ? keybinds.label(`tab${index + 1}`) : '')}
		onSelect={(tile, reason) => cursor.setTile(tile, { resetIndex: reason === 'select' })}
	/>
</section>

<style>
	.evidenceArea {
		min-width: 0;
	}
</style>
