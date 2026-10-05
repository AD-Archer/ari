<script lang="ts">
	import Mention from '$lib/components/app/Mention.svelte';
	import {
		Badge,
		Button,
		Dialog,
		Icon,
		KeyValue,
		type BadgeTone,
		type IconName
	} from '$lib/components/ui';

	interface WebhookEvent {
		action: string;
		icon: IconName;
		tone: BadgeTone;
		program: string;
		text: string;
		detailRows: { key: string; value: string }[];
		actorName: string;
		actorColor: string;
		actorSlackId: string | null;
		submissionId: string;
		href: string | null;
		whenLabel: string;
	}

	interface Props {
		event: WebhookEvent | null;
		onClose: () => void;
	}
	let { event: current, onClose }: Props = $props();

	// the last event stays rendered while the dialog animates closed
	let event = $state<WebhookEvent | null>(null);
	$effect.pre(() => {
		if (current) event = current;
	});

	const items = $derived(
		event
			? [
					{ key: 'Program', value: event.program },
					...event.detailRows,
					...(event.submissionId
						? [{ key: 'Submission', value: event.submissionId, mono: true, copy: true }]
						: []),
					{ key: 'Triggered by', value: event.actorName || 'System' },
					{ key: 'When', value: event.whenLabel }
				]
			: []
	);
</script>

<Dialog open={current !== null} title={event?.text ?? 'Webhook event'} size="lg" {onClose}>
	{#if event}
		<div class="detail">
			<Badge tone={event.tone}><Icon name={event.icon} size={12} /> {event.action}</Badge>
			<KeyValue {items}>
				{#snippet value(item)}
					{#if item.key === 'Triggered by' && event?.actorName}
						<Mention name={event.actorName} color={event.actorColor} slackId={event.actorSlackId} />
					{:else}
						{item.value}
					{/if}
				{/snippet}
			</KeyValue>
		</div>
	{/if}
	{#snippet footer()}
		{#if event?.href}
			<Button icon="external" href={event.href}>Open submission</Button>
		{/if}
		<Button variant="primary" data-autofocus onclick={onClose}>Close</Button>
	{/snippet}
</Dialog>

<style>
	.detail {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-3);
	}
</style>
