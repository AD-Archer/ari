<script lang="ts">
	import { formatDuration } from '$lib/time';

	interface Props {
		seconds: number;
		label?: string;
		lead?: string;
	}
	let { seconds, label, lead }: Props = $props();
</script>

<span class="shipTime">
	{#if lead}<span class="lead">{lead}</span>{/if}
	<span class={['duration', lead && 'minor']}>
		{formatDuration(seconds)}{#if label}&nbsp;{label}{/if}
	</span>
</span>

<style>
	.shipTime {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		white-space: nowrap;
	}
	.lead {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--text-2);
	}
	.duration {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		color: var(--text-2);
	}
	.minor {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
</style>
