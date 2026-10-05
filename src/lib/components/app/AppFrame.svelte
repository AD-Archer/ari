<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Tabs, type IconName } from '$lib/components/ui';
	import Logo from './Logo.svelte';
	import UserMenu from './UserMenu.svelte';

	interface FrameTab {
		value: string;
		label: string;
		icon?: IconName;
		href: string;
		count?: number;
	}
	interface Props {
		tabs: FrameTab[];
		active: string;
		navLabel: string;
		lead: Snippet;
		children: Snippet;
	}
	let { tabs, active, navLabel, lead, children }: Props = $props();
</script>

<div class="appFrame">
	<header>
		<div class="top">
			<span class="logo"><Logo linked /></span>
			<div class="lead">{@render lead()}</div>
			<UserMenu />
		</div>
		{#if tabs.length}
			<nav aria-label={navLabel}><Tabs {tabs} value={active} label={navLabel} /></nav>
		{/if}
	</header>
	<main>{@render children()}</main>
</div>

<style>
	.appFrame {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		background: var(--bg);
	}
	header {
		position: sticky;
		top: 0;
		z-index: var(--layer-header);
		background: var(--surface);
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-4);
	}
	.lead {
		display: flex;
		flex: 1;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-4);
		width: 100%;
		max-width: 1240px;
		min-width: 0;
		margin: 0 auto;
		padding: var(--space-5) var(--space-4) var(--space-7);
	}
	.logo {
		display: inline-flex;
	}
	@media (max-width: 600px) {
		.logo {
			display: none;
		}
		.top {
			gap: var(--space-2);
			padding: var(--space-2) var(--space-3);
		}
		main {
			padding: var(--space-4) var(--space-3) var(--space-6);
		}
	}
</style>
