<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props {
		keys: string;
	}
	let { keys, ...rest }: Props & HTMLAttributes<HTMLElement> = $props();
</script>

<kbd class="kbd" {...rest}>{keys}</kbd>

<style>
	.kbd {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.6em;
		padding: 1px var(--space-1);
		border: 1px solid var(--border-2);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.4;
		white-space: nowrap;
	}
</style>
