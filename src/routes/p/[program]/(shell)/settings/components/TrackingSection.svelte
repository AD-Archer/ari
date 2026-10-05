<script lang="ts">
	import { DatePicker } from '$lib/components/ui';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { form }: { form: SettingsForm } = $props();
</script>

<SettingSection title="Tracking window" description="Since when data should be taken into account.">
	<DatePicker
		label="Tracking start date"
		name="trackingStartsAt"
		placeholder="No start limit"
		bind:value={form.values.trackingStartsAt}
	/>
	<p>
		Commits and Hackatime time before this date (UTC) don't count. Tracking always stops the moment
		a ship is submitted. Leave empty for no start limit. Applies to ships received after the change.
	</p>
</SettingSection>

<style>
	p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
