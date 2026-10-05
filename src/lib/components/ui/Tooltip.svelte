<script lang="ts">
	import type { Snippet } from 'svelte';
	import { placeFloating } from './floating';

	interface Props {
		text: string;
		side?: 'top' | 'bottom';
		children: Snippet;
	}
	let { text, side = 'top', children }: Props = $props();

	const uid = $props.id();
	let shown = $state(false);
	let wrapperElement = $state<HTMLSpanElement>();
	let bubbleElement = $state<HTMLSpanElement>();
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	function show() {
		clearTimeout(hideTimer);
		shown = true;
	}

	function hide() {
		clearTimeout(hideTimer);
		// 120ms: long enough to move the pointer across the gap onto the bubble
		hideTimer = setTimeout(() => (shown = false), 120);
	}

	$effect(() => {
		const target = wrapperElement?.querySelector<HTMLElement>(
			'button, a[href], input, select, textarea, [tabindex]'
		);
		target?.setAttribute('aria-describedby', `${uid}-tooltip`);
		return () => target?.removeAttribute('aria-describedby');
	});

	$effect(() => {
		const wrapperNode = wrapperElement;
		const bubbleNode = bubbleElement;
		if (!shown || !wrapperNode || !bubbleNode) return;
		bubbleNode.showPopover();
		placeFloating(wrapperNode, bubbleNode, side, 'center');
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') shown = false;
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			if (bubbleNode.isConnected && bubbleNode.matches(':popover-open')) bubbleNode.hidePopover();
		};
	});
</script>

<span
	class="tooltip"
	role="presentation"
	bind:this={wrapperElement}
	onpointerenter={show}
	onpointerleave={hide}
	onfocusin={show}
	onfocusout={hide}
>
	{@render children()}
	<span id="{uid}-tooltip" class="bubble" role="tooltip" popover="manual" bind:this={bubbleElement}>
		{text}
	</span>
</span>

<style>
	.tooltip {
		display: inline-flex;
	}
	.bubble {
		position: fixed;
		inset: auto;
		z-index: var(--layer-dropdown);
		max-width: 32ch;
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--text);
		color: var(--surface);
		font-size: var(--text-xs);
		font-weight: 600;
		line-height: 1.4;
		box-shadow: var(--shadow);
		transition: opacity 0.12s;
	}
	@starting-style {
		.bubble:popover-open {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.bubble {
			transition: none;
		}
	}
</style>
