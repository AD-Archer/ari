<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	interface Props {
		title: string;
		code: string;
		tone?: 'green' | 'blue';
	}
	let { title, code, tone = 'blue' }: Props = $props();
</script>

<div class="codeBlock">
	<div class="bar">
		<span class={['dot', tone]}></span>
		<span class="title">{title}</span>
		<span class="copy"><CopyButton text={code} /></span>
	</div>
	<pre>{code}</pre>
</div>

<style>
	.codeBlock {
		margin-top: var(--space-4);
		border: 1px solid var(--doc-line);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: color-mix(in srgb, var(--surface) 55%, var(--bg));
	}
	.bar {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
		border-bottom: 1px solid var(--doc-line-soft);
		background: color-mix(in srgb, var(--surface-3) 40%, transparent);
	}
	.title {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--text-2);
	}
	.dot {
		flex: 0 0 auto;
		width: var(--space-2);
		height: var(--space-2);
		border-radius: 50%;
	}
	.green {
		background: var(--color-green);
	}
	.blue {
		background: var(--color-blue);
	}
	.copy {
		margin-left: auto;
	}
	pre {
		margin: 0;
		padding: var(--space-4);
		overflow-x: auto;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		line-height: 1.72;
		color: color-mix(in srgb, var(--text) 92%, var(--text-2));
		tab-size: 2;
	}
	pre::selection {
		background: color-mix(in srgb, var(--primary) 30%, transparent);
	}
</style>
