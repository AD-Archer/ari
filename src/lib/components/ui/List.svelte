<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props {
		flush?: boolean;
		children: Snippet;
	}
	let { flush = false, children, ...rest }: Props & HTMLAttributes<HTMLUListElement> = $props();
</script>

<ul class={['list', flush && 'flush']} {...rest}>{@render children()}</ul>

<style>
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		overflow: hidden;
	}
	.flush {
		border: 0;
		border-radius: 0;
	}
</style>
