<script lang="ts">
	import { privateProvider } from '$private';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const FraudPage = privateProvider.slots.fraudPage;
</script>

{#if FraudPage}<FraudPage programId={data.programId} view={data.view} />{/if}
