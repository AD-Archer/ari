<script lang="ts">
	import { privateProvider } from '$private';
	import PageHeader from '$lib/components/app/PageHeader.svelte';
	import { Card, SaveBar } from '$lib/components/ui';
	import { settingsTabs, type SettingsTab } from '$lib/settingsRules';
	import { strParam } from '$lib/urlFilter.svelte';
	import ChecklistSection from './components/ChecklistSection.svelte';
	import DangerZoneSection from './components/DangerZoneSection.svelte';
	import EvidenceSection from './components/EvidenceSection.svelte';
	import FieldsSection from './components/FieldsSection.svelte';
	import GoalSection from './components/GoalSection.svelte';
	import IdentitySection from './components/IdentitySection.svelte';
	import IngestSection from './components/IngestSection.svelte';
	import OutboundSection from './components/OutboundSection.svelte';
	import ReviewersChannelSection from './components/ReviewersChannelSection.svelte';
	import ScreeningSection from './components/ScreeningSection.svelte';
	import SnippetsSection from './components/SnippetsSection.svelte';
	import TrackingSection from './components/TrackingSection.svelte';
	import WorkflowSection from './components/WorkflowSection.svelte';
	import { createSettingsForm } from './settingsForm.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const form = createSettingsForm(() => data);
	const tabParam = strParam<SettingsTab>('tab', 'general');
	const tab = $derived(settingsTabs.includes(tabParam.value) ? tabParam.value : 'general');

	const tabs: { value: SettingsTab; label: string }[] = [
		{ value: 'general', label: 'General' },
		{ value: 'intake', label: 'Intake' },
		{ value: 'review', label: 'Review' },
		{ value: 'tools', label: 'Reviewer tools' },
		{ value: 'webhooks', label: 'Webhooks' }
	];

	const privateCards = $derived(
		privateProvider.slots.settingsCards.filter((card) => (card.tab ?? 'review') === tab)
	);
</script>

<svelte:head><title>{data.program} · Settings · Ari</title></svelte:head>

<PageHeader
	title="Settings"
	description="How this program takes in ships, reviews them and reports back."
	{tabs}
	tabsLabel="Settings sections"
	bind:tab={() => tab, (next) => (tabParam.value = next)}
/>

<Card padded={false}>
	<div class="sections">
		{#if tab === 'general'}
			<IdentitySection {form} uploadsConfigured={data.uploadsConfigured} />
			<ReviewersChannelSection
				{form}
				savedChannel={data.settings.reviewersChannel}
				status={data.reviewersChannelStatus}
			/>
			<DangerZoneSection programName={data.program ?? ''} archived={data.status === 'ARCHIVED'} />
		{:else if tab === 'intake'}
			<EvidenceSection {form} />
			<TrackingSection {form} />
			<ScreeningSection {form} />
		{:else if tab === 'review'}
			<WorkflowSection
				{form}
				canDisableJustification={data.canDisableJustification}
				priorityFormUrl={data.priorityFormUrl}
			/>
			<GoalSection {form} />
		{:else if tab === 'tools'}
			<ChecklistSection {form} />
			<FieldsSection {form} />
			<SnippetsSection {form} />
		{:else}
			<IngestSection webhook={data.webhook} />
			<OutboundSection {form} webhook={data.webhook} />
		{/if}
		{#each privateCards as card (card.id)}
			<card.component
				programId={data.programId ?? ''}
				data={data.privateSettings}
				staged={form.values as unknown as Record<string, unknown>}
				revision={form.revision}
				stage={(entries) => form.stage(card.id, entries)}
			/>
		{/each}
	</div>
</Card>

<SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} onDiscard={form.discard} />

<style>
	.sections {
		padding: 0 var(--space-5);
	}
	@media (max-width: 760px) {
		.sections {
			padding: 0 var(--space-4);
		}
	}
</style>
