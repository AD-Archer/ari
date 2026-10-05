<script lang="ts">
	import { iconPaths, type IconName } from './iconPaths';

	interface Props {
		name: IconName;
		size?: number;
		strokeWidth?: number;
		class?: string;
	}
	let { name, size = 20, strokeWidth = 1.9, class: className = '' }: Props = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- static path data from iconPaths.ts -->
	{@html iconPaths[name]}
</svg>
