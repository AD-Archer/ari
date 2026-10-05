<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button, SegmentedControl } from '$lib/components/ui';
	import type { Track } from '$lib/data';
	import { applyListParams } from './listNavigation';

	interface Props {
		track: Track | null;
		showTrack: boolean;
		clearable?: boolean;
		clearKeys?: string[];
		lead?: Snippet;
		children?: Snippet;
	}
	let { track, showTrack, clearable = false, clearKeys = [], lead, children }: Props = $props();

	const clear = () =>
		applyListParams(Object.fromEntries(['track', ...clearKeys].map((key) => [key, null])));
</script>

<div class="shipListFilters">
	<div class="group">
		{@render lead?.()}
		{#if showTrack}
			<SegmentedControl
				label="Track"
				size="sm"
				options={[
					{ value: 'all', label: 'All' },
					{ value: 'software', label: 'Software' },
					{ value: 'hardware', label: 'Hardware' }
				]}
				bind:value={
					() => track ?? 'all', (next) => applyListParams({ track: next === 'all' ? null : next })
				}
			/>
		{/if}
		{#if clearable || track}
			<Button variant="quiet" size="sm" icon="x" onclick={clear}>Clear</Button>
		{/if}
	</div>
	{#if children}<div class="group">{@render children()}</div>{/if}
</div>

<style>
	.shipListFilters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.group {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
</style>
