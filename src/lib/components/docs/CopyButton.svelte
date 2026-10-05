<script lang="ts">
	import { Button } from '$lib/components/ui';

	let { text }: { text: string } = $props();

	let status = $state<'idle' | 'copied' | 'failed'>('idle');

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			status = 'copied';
		} catch {
			status = 'failed';
		}
		setTimeout(() => (status = 'idle'), 2000); // 2 s: 2 * 1000
	}
</script>

<Button variant="quiet" size="sm" icon={status === 'copied' ? 'check' : 'clip'} onclick={copy}>
	<span aria-live="polite">
		{status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy'}
	</span>
</Button>
