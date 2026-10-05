<script lang="ts">
	import ProgramShell from '$lib/components/app/ProgramShell.svelte';

	let { children } = $props();
</script>

<ProgramShell>{@render children()}</ProgramShell>
