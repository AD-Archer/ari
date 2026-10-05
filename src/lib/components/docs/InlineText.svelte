<script lang="ts">
	let { text }: { text: string } = $props();

	// backticks mark inline code, so odd segments are code
	const segments = $derived(
		text.split('`').map((segment, index) => ({ segment, isCode: index % 2 === 1 }))
	);
</script>

{#each segments as { segment, isCode }, index (index)}{#if isCode}<code>{segment}</code
		>{:else}{segment}{/if}{/each}
