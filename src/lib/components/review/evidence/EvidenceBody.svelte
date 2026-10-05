<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();

	// enter and space on a focused button or link inside a tile belong to that control, not to
	// the page's row shortcuts
	function keepControlKeys(node: HTMLElement) {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			if (event.target instanceof Element && event.target.closest('button, a'))
				event.stopPropagation();
		};
		node.addEventListener('keydown', onKey);
		return { destroy: () => node.removeEventListener('keydown', onKey) };
	}
</script>

<div class="evidenceBody" use:keepControlKeys>{@render children()}</div>

<style>
	.evidenceBody {
		min-width: 0;
		padding: var(--space-2) var(--space-4) var(--space-3);
	}
	@container evidenceTile (max-width: 560px) {
		.evidenceBody {
			padding-inline: var(--space-3);
		}
	}
</style>
