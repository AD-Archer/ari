<script lang="ts">
	import { Toggle } from '$lib/components/ui';
	import type { Evidence } from '$lib/data';
	import OptionGroup from '$lib/components/app/OptionGroup.svelte';
	import type { ProgramWizard } from '../programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
	}
	let { wizard }: Props = $props();

	const kinds: { id: Evidence; label: string; description: string }[] = [
		{ id: 'commits', label: 'Git commits', description: 'Pull commit history from the repo' },
		{
			id: 'elapsed',
			label: 'Elapsed recordings',
			description: 'Screen timelapses recorded with Lapse'
		},
		{ id: 'devlog', label: 'Devlog / journal', description: 'Written session entries' }
	];

	function flip(kind: Evidence) {
		const held = wizard.draft.evidence;
		wizard.draft.evidence = held.includes(kind)
			? held.filter((entry) => entry !== kind)
			: [...held, kind];
	}
</script>

<OptionGroup label="Accepted evidence">
	{#each kinds as kind (kind.id)}
		<Toggle
			label={kind.label}
			description={kind.description}
			checked={wizard.draft.evidence.includes(kind.id)}
			onchange={() => flip(kind.id)}
		/>
	{/each}
</OptionGroup>
