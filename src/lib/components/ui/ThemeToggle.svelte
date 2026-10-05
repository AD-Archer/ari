<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/theme.svelte';
	import Button from './Button.svelte';

	interface Props {
		showLabel?: boolean;
		size?: 'sm' | 'md' | 'lg';
	}
	let { showLabel = false, size = 'md' }: Props = $props();

	// the server cannot know the stored theme, so render the default until hydration has finished
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	const dark = $derived(mounted ? theme.dark : true);
	const actionLabel = $derived(dark ? 'Switch to light theme' : 'Switch to dark theme');
</script>

<Button
	{size}
	variant={showLabel ? 'ghost' : 'quiet'}
	icon={dark ? 'sun' : 'moon'}
	aria-label={showLabel ? undefined : actionLabel}
	title={showLabel ? undefined : actionLabel}
	onclick={theme.toggle}
>
	{#if showLabel}{actionLabel}{/if}
</Button>
