<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import NamePrompt from '$lib/components/app/NamePrompt.svelte';
	import PrivateOverlay from '$lib/components/app/PrivateOverlay.svelte';
	import { NavProgress, Toaster } from '$lib/components/ui';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<NavProgress />
<Toaster />
{#if data.user?.namePending}
	<NamePrompt />
{/if}

{@render children()}

{#if data.privateOverlay}
	<PrivateOverlay data={data.privateOverlay} />
{/if}
