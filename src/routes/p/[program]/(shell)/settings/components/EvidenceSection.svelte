<script lang="ts">
	import { Toggle } from '$lib/components/ui';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { form }: { form: SettingsForm } = $props();
</script>

<SettingSection
	title="Data views"
	description="What data is accepted on your program and is submitted."
>
	<Toggle
		label="Git commits"
		description="Pull commit history from the linked repo"
		bind:checked={form.values.accepts.commits}
	/>
	<Toggle
		label="Elapsed recordings"
		description="Screen timelapses recorded with Lapse"
		bind:checked={form.values.accepts.elapsed}
	/>
	<Toggle
		label="Devlog / journal"
		description="Written session entries with durations"
		bind:checked={form.values.accepts.devlog}
	/>
	<Toggle
		label="Collaborative projects"
		description="Ships may carry multiple makers, each with their own hours"
		bind:checked={form.values.collaborative}
	/>
</SettingSection>
