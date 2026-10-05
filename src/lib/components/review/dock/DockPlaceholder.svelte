<script lang="ts">
	import { styleVariables } from '$lib/review/dockDom';
	import type { DockRect } from '$lib/review/dockGeometry';

	interface Props {
		rect: DockRect;
		variant?: 'drop' | 'detach';
		hidden?: boolean;
		instant?: boolean;
	}
	let { rect, variant = 'drop', hidden = false, instant = false }: Props = $props();
</script>

<div
	class={['placeholder', variant, hidden && 'faded', instant && 'instant']}
	aria-hidden="true"
	use:styleVariables={{
		'tile-x': `${rect.x}px`,
		'tile-y': `${rect.y}px`,
		'tile-width': `${rect.width}px`,
		'placeholder-height': `${rect.height}px`
	}}
></div>

<style>
	.placeholder {
		position: absolute;
		top: 0;
		left: 0;
		width: var(--tile-width);
		height: var(--placeholder-height);
		border: 1.5px solid color-mix(in srgb, var(--color-blue) 36%, transparent);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-blue) 8%, var(--surface));
		box-shadow:
			inset 0 0 0 3px color-mix(in srgb, var(--surface) 60%, transparent),
			0 8px 24px color-mix(in srgb, var(--color-blue) 8%, transparent);
		transform: translate3d(var(--tile-x), var(--tile-y), 0);
		transition:
			transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.42s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.32s cubic-bezier(0.22, 1, 0.36, 1),
			opacity 0.16s ease;
		pointer-events: none;
	}
	.faded {
		opacity: 0;
	}
	.instant {
		transition: none;
	}
	.detach {
		z-index: 1;
		border-style: dashed;
		border-color: color-mix(in srgb, var(--color-blue) 62%, transparent);
		background: color-mix(in srgb, var(--color-blue) 10%, transparent);
		box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--surface) 45%, transparent);
		opacity: 0.82;
	}
	@media (prefers-reduced-motion: reduce) {
		.placeholder {
			transition: none;
		}
	}
</style>
