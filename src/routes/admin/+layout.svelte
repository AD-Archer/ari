<script lang="ts">
	import AdminShell from '$lib/components/app/AdminShell.svelte';

	let { children } = $props();
</script>

<AdminShell>{@render children()}</AdminShell>
