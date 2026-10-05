<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		tone?: 'danger' | 'neutral';
		children: Snippet;
	}
	let { tone = 'neutral', children }: Props = $props();
</script>

<div class={['notice', tone]} role={tone === 'danger' ? 'alert' : 'status'}>
	{@render children()}
</div>

<style>
	.notice {
		--tone: var(--text-2);
		padding: var(--space-3);
		border: 1px solid color-mix(in srgb, var(--tone) 28%, transparent);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--tone) 12%, transparent);
		color: var(--tone);
		font-size: var(--text-sm);
		font-weight: 500;
	}
	.danger {
		--tone: var(--color-red);
	}
</style>
