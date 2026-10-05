<script lang="ts">
	let { data }: { data: Record<string, unknown> } = $props();

	// imported on demand so the pages of everyone else never fetch the private module for this
	const overlay = import('$private').then(({ privateProvider }) =>
		privateProvider.slots.appOverlay?.()
	);
</script>

{#await overlay then loaded}
	{#if loaded}
		<loaded.default {data} />
	{/if}
{/await}
