<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button, KeyValue, Notice } from '$lib/components/ui';
	import { submitAction } from '$lib/actions';
	import { toast } from '$lib/toast.svelte';
	import type { PageData } from '../$types';
	import DeliveryLog from './DeliveryLog.svelte';
	import SecretField from './SecretField.svelte';
	import SettingSection from '$lib/components/app/SettingSection.svelte';

	let { webhook }: { webhook: PageData['webhook'] } = $props();

	let testing = $state(false);

	const rows = $derived(
		webhook.deliveries.map((delivery) => ({ ...delivery, detail: delivery.externalId }))
	);

	async function testPing() {
		if (testing) return;
		testing = true;
		const result = await submitAction(
			'test',
			{},
			{ errorToast: true, fallbackMessage: 'Test ping failed' }
		);
		testing = false;
		if (result.ok) toast.success('Test ping sent');
	}
</script>

<SettingSection title="Incoming ships">
	{#snippet intro()}
		<p>
			Programs POST new ships to the ingest endpoint, signed with the ingest secret. See the
			<a href={resolve('/docs/webhooks')}>webhooks docs</a> for payloads and response codes.
		</p>
	{/snippet}
	{#if webhook.endpoint}
		<KeyValue
			layout="stacked"
			items={[{ key: 'Ingest endpoint', value: webhook.endpoint, mono: true, copy: true }]}
		/>
	{:else}
		<Notice>
			Webhook ingestion is not configured on this deployment, so there is no ingest endpoint to
			show. Set WEBHOOKS_URL to enable it.
		</Notice>
	{/if}
	<SecretField
		title="Ingest signing secret"
		masked={webhook.inSecretMasked}
		emptyLabel="No signing secret yet"
		rollAction="rollSecret"
		revealAction="revealSecret"
		rollWarning="The old secret stops working immediately. Ships signed with it are refused until the program switches to the new one."
	>
		Verifies incoming ships. Rolling invalidates the old secret immediately.
	</SecretField>
	<DeliveryLog
		title="Inbound delivery log"
		{rows}
		emptyText="No deliveries yet. Send a test ping to verify your secret."
	>
		{#snippet action()}
			<Button variant="soft" size="sm" icon="play" loading={testing} onclick={testPing}>
				Send test ping
			</Button>
		{/snippet}
	</DeliveryLog>
</SettingSection>

<style>
	a {
		color: var(--primary);
		font-weight: 600;
	}
</style>
