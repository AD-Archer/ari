<script lang="ts">
	import { Button, Textarea, TextField } from '$lib/components/ui';
	import { copyText } from '$lib/actions';
	import type { SettingsForm } from '../settingsForm.svelte';

	interface Props {
		form: SettingsForm;
		formUrl: string | null;
	}
	let { form, formUrl }: Props = $props();
</script>

{#if formUrl}
	<div class="link">
		<div class="grow">
			<TextField
				label="Form link"
				name="priorityFormUrl"
				mono
				readonly
				value={formUrl}
				onfocus={(event) => event.currentTarget.select()}
			/>
		</div>
		<Button icon="clip" onclick={() => copyText(formUrl, 'Form link copied')}>Copy</Button>
	</div>
	<p>
		Share this with makers. They sign in with Hack Club Auth and pick which of their queued ships
		get priority. The link stays the same when you toggle the feature.
	</p>
{:else}
	<p>Save to generate the form link.</p>
{/if}
<Textarea
	label="Form message"
	name="priorityReviewMessage"
	maxlength={2000}
	placeholder="Shown to makers at the top of the form."
	hint="Optional. Tell makers when they should (and shouldn't) request priority review."
	bind:value={form.values.priorityReviewMessage}
/>

<style>
	.link {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
	}
	.grow {
		flex: 1 1 260px;
		min-width: 0;
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
