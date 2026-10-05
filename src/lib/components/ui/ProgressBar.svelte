<script lang="ts">
	interface Props {
		label: string;
		value?: number;
		max?: number;
		valueText?: string;
		tone?: 'primary' | 'ok' | 'neutral';
		size?: 'sm' | 'md';
	}
	let { label, value, max = 100, valueText, tone = 'primary', size = 'md' }: Props = $props();

	const indeterminate = $derived(value === undefined);
	const percent = $derived(max > 0 ? Math.min(Math.max(((value ?? 0) / max) * 100, 0), 100) : 0);
</script>

<div
	class={['progressBar', tone, size, indeterminate && 'indeterminate']}
	role="progressbar"
	aria-label={label}
	aria-valuemin={indeterminate ? undefined : 0}
	aria-valuemax={indeterminate ? undefined : max}
	aria-valuenow={value}
	aria-valuetext={valueText}
>
	<!-- eslint-disable-next-line svelte/no-inline-styles -- the one place the fill takes its data-driven width -->
	<span class="fill" style:width={indeterminate ? undefined : `${percent}%`}></span>
</div>

<style>
	.progressBar {
		--tone: var(--primary);
		width: 100%;
		height: var(--space-2);
		overflow: hidden;
		border-radius: var(--radius-full);
		background: var(--surface-3);
	}
	.sm {
		height: var(--space-1);
	}
	.ok {
		--tone: var(--color-green);
	}
	.neutral {
		--tone: var(--text-3);
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--tone);
		transition: width 0.3s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	.indeterminate .fill {
		width: 40%;
		animation: slide 1.2s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
		.indeterminate .fill {
			width: 100%;
			opacity: 0.5;
			animation: none;
		}
	}
</style>
