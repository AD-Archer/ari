<script lang="ts">
	import { Toggle } from '$lib/components/ui';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { form }: { form: SettingsForm } = $props();
</script>

<SettingSection title="Screening" description="Checks that run when a ship arrives.">
	<Toggle
		label="Identity screening"
		description="Screen incoming ships on the maker's Hack Club identity"
		bind:checked={form.values.screenIdentity}
	/>
	<Toggle
		label="Hackatime screening"
		description="Screen incoming ships on the maker's Hackatime standing"
		bind:checked={form.values.screenHackatime}
	/>
</SettingSection>
