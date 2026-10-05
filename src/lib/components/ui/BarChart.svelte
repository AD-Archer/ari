<script lang="ts" module>
	export interface BarChartBar {
		key: string;
		value: number;
		tick?: string;
		title: string;
	}
</script>

<script lang="ts">
	interface Props {
		label: string;
		bars: BarChartBar[];
		selected?: number | null;
		scaleFloor?: number;
		dense?: boolean;
	}
	let { label, bars, selected = $bindable(null), scaleFloor = 1, dense = false }: Props = $props();

	const scaleMax = $derived(Math.max(scaleFloor, ...bars.map((bar) => bar.value)));
</script>

<div class={['barChart', dense && 'dense']} role="group" aria-label={label}>
	{#each bars as bar, index (bar.key)}
		{@const height = `${(bar.value / scaleMax) * 100}%`}
		<button
			type="button"
			class={{ column: true, selected: index === selected }}
			aria-label={bar.title}
			aria-pressed={index === selected}
			onclick={() => (selected = index)}
			onfocus={() => (selected = index)}
			onpointerenter={(event) => event.pointerType === 'mouse' && (selected = index)}
		>
			<span class="plot">
				<!-- eslint-disable-next-line svelte/no-inline-styles -- the one place a bar takes its data-driven height -->
				<span class={['bar', bar.value === 0 && 'empty']} style:height></span>
			</span>
			<!-- the nbsp keeps unlabelled columns the same height as labelled ones -->
			<span class="tick">{bar.tick || ' '}</span>
		</button>
	{/each}
</div>

<style>
	.barChart {
		display: flex;
		align-items: stretch;
		gap: var(--space-3);
		height: 168px;
		min-width: 0;
	}
	.dense {
		gap: 3px;
	}
	.column {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-3);
		cursor: pointer;
	}
	.plot {
		display: flex;
		flex: 1;
		align-items: flex-end;
		min-height: 0;
	}
	.bar {
		width: 100%;
		min-height: 3px;
		border-radius: var(--radius-sm) var(--radius-sm) 2px 2px;
		background: color-mix(in srgb, var(--primary) 40%, var(--surface-3));
		transition: background 0.15s;
	}
	.empty {
		background: var(--surface-3);
	}
	.dense .bar {
		border-radius: 2px;
	}
	.selected .bar:not(.empty) {
		background: var(--primary);
	}
	.tick {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1;
		text-align: center;
		white-space: nowrap;
	}
	.selected .tick {
		color: var(--text);
	}
</style>
