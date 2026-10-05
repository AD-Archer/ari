<script lang="ts">
	interface Props {
		shape?: 'line' | 'block' | 'circle';
		width?: string;
		height?: string;
	}
	let { shape = 'line', width, height }: Props = $props();
</script>

<!-- eslint-disable svelte/no-inline-styles -- the one place a placeholder takes a caller-given size -->
<span class={['skeleton', shape]} style:width style:height aria-hidden="true"></span>

<!-- eslint-enable svelte/no-inline-styles -->

<style>
	.skeleton {
		display: block;
		max-width: 100%;
		border-radius: var(--radius-sm);
		background: linear-gradient(
			100deg,
			var(--surface-2) 30%,
			var(--surface-3) 50%,
			var(--surface-2) 70%
		);
		background-size: 200% 100%;
		animation: shimmer 1.3s linear infinite;
	}
	.line {
		width: 100%;
		height: var(--space-3);
	}
	.block {
		width: 100%;
		height: var(--space-7);
		border-radius: var(--radius-md);
	}
	.circle {
		flex: none;
		width: var(--space-6);
		height: var(--space-6);
		border-radius: var(--radius-full);
	}
	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton {
			animation: none;
			background: var(--surface-3);
		}
	}
</style>
