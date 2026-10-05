<script lang="ts">
	import { navigating } from '$app/state';

	let visible = $state(false);
	let done = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	$effect(() => {
		clearTimeout(timer);
		if (navigating.to) {
			done = false;
			// instant client-side hops stay silent: the bar only shows once a navigation outlives this
			timer = setTimeout(() => (visible = true), 150);
		} else if (visible) {
			done = true;
			timer = setTimeout(() => {
				visible = false;
				done = false;
			}, 380); // the 0.3s fade-out plus its 0.08s delay
		}
		return () => clearTimeout(timer);
	});
</script>

{#if visible}
	<div class={{ navProgress: true, done }} aria-hidden="true"></div>
{/if}

<style>
	.navProgress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: var(--layer-toast);
		height: 3px;
		background: var(--primary);
		transform-origin: 0 50%;
		transform: scaleX(0);
		pointer-events: none;
		animation: creep 8s cubic-bezier(0.08, 0.6, 0.18, 1) forwards;
		transition:
			transform 0.18s ease,
			opacity 0.3s ease 0.08s;
	}
	.done {
		animation: none;
		transform: scaleX(1);
		opacity: 0;
	}
	@keyframes creep {
		0% {
			transform: scaleX(0);
		}
		12% {
			transform: scaleX(0.45);
		}
		45% {
			transform: scaleX(0.78);
		}
		100% {
			transform: scaleX(0.94);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.navProgress {
			animation: none;
			transform: scaleX(1);
			opacity: 0.6;
			transition: none;
		}
		.done {
			opacity: 0;
		}
	}
</style>
