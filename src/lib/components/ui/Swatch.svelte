<script lang="ts">
	interface Props {
		color: string;
		size?: 'sm' | 'md';
	}
	let { color, size = 'md' }: Props = $props();
</script>

<!-- eslint-disable-next-line svelte/no-inline-styles -- the one place a data-driven colour is applied -->
<span class={['swatch', size]} style:background={color}></span>

<style>
	.swatch {
		display: inline-block;
		flex: none;
		width: var(--space-6);
		height: var(--space-6);
		border-radius: var(--radius-sm);
	}
	.sm {
		width: var(--space-4);
		height: var(--space-4);
		border-radius: var(--space-1);
	}
</style>
