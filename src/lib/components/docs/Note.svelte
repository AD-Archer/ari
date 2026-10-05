<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '$lib/components/ui';

	let { children }: { children: Snippet } = $props();
</script>

<div class="note">
	<span class="icon"><Icon name="info" size={17} /></span>
	<div class="body">{@render children()}</div>
</div>

<style>
	.note {
		margin-top: var(--space-4);
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--doc-line);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--primary) 6%, transparent);
	}
	.icon {
		flex: 0 0 auto;
		margin-top: 1px;
		color: var(--primary);
	}
	.body {
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		color: var(--text-2);
	}
	.body :global(p) {
		margin: 0;
	}
</style>
