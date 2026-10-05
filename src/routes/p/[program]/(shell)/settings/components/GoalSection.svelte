<script lang="ts">
	import { TextField } from '$lib/components/ui';
	import { parseReviewGoal } from '$lib/settingsRules';
	import type { SettingsForm } from '../settingsForm.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { form }: { form: SettingsForm } = $props();
</script>

<SettingSection
	title="Weekly review goal"
	description="Per-reviewer target for the week. Drives the goal bar in the review header."
>
	<div class="narrow">
		<TextField
			label="Reviews per week"
			name="reviewGoal"
			inputmode="numeric"
			bind:value={form.values.reviewGoal}
			error={parseReviewGoal(form.values.reviewGoal) === null
				? 'A whole number between 1 and 10000.'
				: null}
		/>
	</div>
</SettingSection>

<style>
	.narrow {
		max-width: 200px;
	}
</style>
