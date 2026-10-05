<script lang="ts">
	import { untrack } from 'svelte';
	import { Button, Notice, Prose, Skeleton } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';
	import EvidenceBody from './EvidenceBody.svelte';

	interface Props {
		// nothing is fetched until the tile is on screen
		active: boolean;
	}
	let { active }: Props = $props();

	const { context } = useReview();

	type Loaded = { shipId: string; html: string | null; error: string | null };
	let loaded = $state<Loaded | null>(null);
	let loading = false;
	const current = $derived(loaded?.shipId === context.ship.id ? loaded : null);

	async function load(shipId: string) {
		if (loading) return;
		loading = true;
		let next: Loaded;
		try {
			const response = await fetch(`/p/${context.programId}/review/${shipId}/readme`);
			if (!response.ok) throw new Error(`http ${response.status}`);
			const answer = (await response.json()) as { ok: boolean; html?: string; message?: string };
			next = answer.ok
				? { shipId, html: answer.html ?? '', error: null }
				: { shipId, html: null, error: answer.message ?? 'Could not load the README.' };
		} catch {
			next = { shipId, html: null, error: 'Could not load the README. Try again.' };
		}
		loading = false;
		// the reviewer may have moved on while the repository was read
		if (shipId === context.ship.id) loaded = next;
		else if (active) void load(context.ship.id);
	}

	$effect(() => {
		const shipId = context.ship.id;
		if (!active) return;
		untrack(() => {
			if (loaded?.shipId !== shipId) void load(shipId);
		});
	});

	function retry() {
		loaded = null;
		void load(context.ship.id);
	}
</script>

<EvidenceBody>
	{#if current?.error}
		<Notice>
			<span class="failed">
				<span>{current.error}</span>
				<Button size="sm" icon="refresh" onclick={retry}>Retry</Button>
			</span>
		</Notice>
	{:else if current?.html === null || current === null}
		<div class="loading" role="status" aria-label="Loading the README">
			<Skeleton width="40%" />
			<Skeleton />
			<Skeleton />
			<Skeleton width="70%" />
		</div>
	{:else if current.html === ''}
		<Notice>The README is empty.</Notice>
	{:else}
		<!-- the endpoint renders it with renderReadme, which builds every tag itself -->
		<div class="readme"><Prose html={current.html} /></div>
	{/if}
</EvidenceBody>

<style>
	.failed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.loading {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2) 0;
	}
	.readme {
		padding: var(--space-2) 2px var(--space-1);
	}
</style>
