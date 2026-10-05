<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="settingGroup">{@render children()}</div>

<style>
	.settingGroup {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-left: var(--space-2);
		padding-left: var(--space-4);
		border-left: 2px solid var(--surface-3);
	}
</style>
