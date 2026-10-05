<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from './iconPaths';

	interface Props {
		label: string;
		value: string | number;
		unit?: string;
		subLabel?: string;
		tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
		icon?: IconName;
		children?: Snippet;
	}
	let { label, value, unit, subLabel, tone = 'neutral', icon, children }: Props = $props();
</script>

<div class={['statTile', tone]}>
	<div class="head">
		<span class="label">{label}</span>
		{#if icon}<span class="icon"><Icon name={icon} size={15} /></span>{/if}
	</div>
	<div class="value">
		{value}{#if unit}<span class="unit">{unit}</span>{/if}
	</div>
	{#if subLabel}<div class="subLabel">{subLabel}</div>{/if}
	{#if children}<div class="extra">{@render children()}</div>{/if}
</div>

<style>
	.statTile {
		--tone: var(--text-2);
		min-width: 0;
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		box-shadow: var(--shadow-sm);
	}
	.ok {
		--tone: var(--color-green);
	}
	.warn {
		--tone: var(--color-orange);
	}
	.danger {
		--tone: var(--color-red);
	}
	.info {
		--tone: var(--color-blue);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.label {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.icon {
		display: grid;
		place-content: center;
		flex: none;
		width: var(--space-5);
		height: var(--space-5);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--tone) 16%, var(--surface));
		color: var(--tone);
	}
	.value {
		margin-top: var(--space-1);
		font-size: var(--text-2xl);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.unit {
		margin-left: 3px;
		font-size: var(--text-md);
		font-weight: 700;
		letter-spacing: 0;
		color: var(--text-2);
	}
	.subLabel {
		margin-top: var(--space-1);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--tone);
	}
	.extra {
		margin-top: var(--space-2);
	}
</style>
