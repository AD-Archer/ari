<script lang="ts">
	import { asset, resolve } from '$app/paths';

	interface Props {
		size?: 'sm' | 'lg';
		linked?: boolean;
	}
	let { size = 'sm', linked = false }: Props = $props();
</script>

{#if linked}
	<a href={resolve('/programs')} class={['logo', size]} aria-label="Hack Club, your programs">
		<img src={asset('/flag.png')} alt="Hack Club" />
	</a>
{:else}
	<span class={['logo', size]}><img src={asset('/flag.png')} alt="Hack Club" /></span>
{/if}

<style>
	.logo {
		display: inline-flex;
		flex: none;
		align-items: center;
		border-radius: var(--radius-sm);
	}
	img {
		display: block;
		height: var(--space-6);
	}
	.lg img {
		height: var(--space-7);
	}
</style>
