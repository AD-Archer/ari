<script lang="ts">
	import { Button, Checkbox, Popover } from '$lib/components/ui';
	import { allTracks, trackLabels, type Track } from '$lib/data';
	import { tracksLabel } from '../settingsLabels';

	interface Props {
		selected: Track[];
		label: string;
		align?: 'start' | 'end';
	}
	let { selected = $bindable(), label, align = 'end' }: Props = $props();

	const uid = $props.id();
	let open = $state(false);
	let listElement = $state<HTMLDivElement>();

	function toggle(track: Track) {
		selected = selected.includes(track)
			? selected.filter((entry) => entry !== track)
			: allTracks.filter((entry) => entry === track || selected.includes(entry));
	}
</script>

<Popover
	bind:open
	{align}
	id="{uid}-panel"
	role="group"
	aria-label={label}
	onOpen={() => listElement?.querySelector('input')?.focus()}
>
	{#snippet anchor()}
		<Button
			size="sm"
			icon="layers"
			iconAfter="chevD"
			variant={selected.length ? 'ghost' : 'danger'}
			aria-label={`${label}: ${tracksLabel(selected)}`}
			aria-expanded={open}
			aria-controls="{uid}-panel"
			onclick={() => (open = !open)}
		>
			{tracksLabel(selected)}
		</Button>
	{/snippet}
	<div class="trackPicker" bind:this={listElement}>
		{#each allTracks as track (track)}
			<Checkbox checked={selected.includes(track)} onchange={() => toggle(track)}>
				{trackLabels[track]}
			</Checkbox>
		{/each}
		{#if !selected.length}<p>Pick at least one track.</p>{/if}
	</div>
</Popover>

<style>
	.trackPicker {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 170px;
		padding: var(--space-3);
		font-size: var(--text-sm);
	}
	p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--accent-red);
	}
</style>
