<script lang="ts">
	import { ColorPicker, DatePicker, TextField } from '$lib/components/ui';
	import { accentColors } from '$lib/data';
	import ChannelVerifier from '../ChannelVerifier.svelte';
	import type { ProgramWizard } from '../programWizard.svelte';

	interface Props {
		wizard: ProgramWizard;
	}
	let { wizard }: Props = $props();

	// a colour set elsewhere stays selectable, so saving does not silently replace it
	const colors = $derived(
		accentColors.includes(wizard.draft.accent) || !wizard.draft.accent
			? accentColors
			: [...accentColors, wizard.draft.accent]
	);

	function onNameKey(event: KeyboardEvent) {
		if (event.key !== 'Enter' || wizard.editing) return;
		event.preventDefault();
		wizard.next();
	}
</script>

<div class="grid">
	<TextField
		label="Program name"
		name="name"
		placeholder="e.g. Hackpad"
		autocomplete="off"
		required
		data-autofocus
		bind:value={wizard.draft.name}
		onkeydown={onNameKey}
	/>
	<ColorPicker label="Accent colour" name="accent" {colors} bind:value={wizard.draft.accent} />
	{#if !wizard.editing}
		<ChannelVerifier {wizard} />
		<div class="date">
			<DatePicker
				label="Tracking starts"
				name="trackingStartsAt"
				bind:value={wizard.draft.trackingStartsAt}
			/>
			<p>Hackatime time before this date doesn't count.</p>
		</div>
	{/if}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		gap: var(--space-4);
	}
	.date {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	p {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--text-2);
	}
	@media (max-width: 600px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
