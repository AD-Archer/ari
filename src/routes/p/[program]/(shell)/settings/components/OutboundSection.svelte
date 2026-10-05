<script lang="ts">
	import { Button, TextField, Toggle } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { isHttpUrl } from '$lib/settingsRules';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from '../$types';
	import type { SettingsForm } from '../settingsForm.svelte';
	import DeliveryLog from './DeliveryLog.svelte';
	import SecretField from './SecretField.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	interface Props {
		form: SettingsForm;
		webhook: PageData['webhook'];
	}
	let { form, webhook }: Props = $props();

	let testing = $state(false);

	const rows = $derived(
		webhook.outboundDeliveries.map((delivery) => ({ ...delivery, detail: delivery.event }))
	);
	const urlError = $derived(
		form.values.outUrl.trim() && !isHttpUrl(form.values.outUrl.trim())
			? 'Must start with http:// or https://'
			: null
	);

	async function testOutbound() {
		if (testing) return;
		testing = true;
		const result = await submitAction(
			'testOutbound',
			{},
			{ errorToast: true, fallbackMessage: 'Test failed' }
		);
		testing = false;
		if (result.ok) toast.success('Test event queued');
	}
</script>

<SettingSection
	title="Review results"
	description="Where decisions are delivered. A paused endpoint keeps its URL and secret but receives nothing. Changes save with the rest of the page."
>
	<TextField
		label="Destination URL"
		name="outUrl"
		type="url"
		placeholder="https://your-site.com/hooks/ari"
		hint="We POST every decision and revert here."
		error={urlError}
		bind:value={form.values.outUrl}
	/>
	<Toggle label="Enabled" bind:checked={form.values.outEnabled} />
	<SecretField
		title="Outbound signing secret"
		masked={webhook.outSecretMasked}
		emptyLabel="No outbound secret yet"
		rollAction="rollOutboundSecret"
		revealAction="revealOutboundSecret"
		rollWarning="Deliveries are signed with the new secret from now on. Your endpoint must verify with it or it will reject them."
	>
		Sent as <code>X-Ari-Signature</code> on outbound requests, alongside
		<code>X-Ari-Timestamp</code> and <code>X-Ari-Delivery-Id</code> (separate from the ingest secret)
		so your endpoint can verify them.
	</SecretField>
	<DeliveryLog
		title="Outbound delivery log"
		{rows}
		emptyText="No deliveries yet. Set a destination above, then send a test event."
	>
		{#snippet action()}
			<Button variant="soft" size="sm" icon="play" loading={testing} onclick={testOutbound}>
				Send test event
			</Button>
		{/snippet}
	</DeliveryLog>
</SettingSection>

<style>
	code {
		font-family: var(--font-mono);
	}
</style>
