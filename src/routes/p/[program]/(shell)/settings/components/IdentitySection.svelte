<script lang="ts">
	import { ImageUpload, TextField } from '$lib/components/ui';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	interface Props {
		form: SettingsForm;
		uploadsConfigured: boolean;
	}
	let { form, uploadsConfigured }: Props = $props();
</script>

<SettingSection
	title="Identity"
	description="What will be shown across the queue and on the program picker."
>
	<TextField
		label="Display name"
		name="displayName"
		required
		bind:value={form.values.displayName}
		error={form.values.displayName.trim() ? null : 'Display name is required.'}
	/>
	<div class="image" role="group" aria-labelledby="iconCaption">
		<span class="caption" id="iconCaption">Icon</span>
		<ImageUpload
			label="icon"
			mode="square"
			uploadsEnabled={uploadsConfigured}
			bind:value={form.values.iconUrl}
		/>
	</div>
	<div class="image" role="group" aria-labelledby="cardCaption">
		<span class="caption" id="cardCaption">Card background</span>
		<ImageUpload
			label="card background"
			mode="wide"
			uploadsEnabled={uploadsConfigured}
			bind:value={form.values.cardBgUrl}
		/>
	</div>
</SettingSection>

<style>
	.image {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.caption {
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-2);
	}
</style>
