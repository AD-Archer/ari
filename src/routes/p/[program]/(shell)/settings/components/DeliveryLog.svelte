<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Badge, List, ListRow } from '$lib/components/ui';

	interface DeliveryRow {
		id: string;
		status: string;
		httpStatus: number | null;
		ok: boolean;
		detail: string | null;
		when: string;
	}

	interface Props {
		title: string;
		rows: DeliveryRow[];
		emptyText: string;
		action: Snippet;
	}
	let { title, rows, emptyText, action }: Props = $props();

	const agoLabel = (span: string) => (span === 'now' ? 'just now' : `${span} ago`);
</script>

<div class="deliveryLog">
	<div class="head">
		<h3>{title}</h3>
		{@render action()}
	</div>
	{#if rows.length}
		<List flush aria-label={title}>
			{#each rows as row (row.id)}
				<ListRow title={row.status} meta={agoLabel(row.when)}>
					{#snippet leading()}
						{#if row.httpStatus === null}
							<Badge>···</Badge>
						{:else}
							<Badge tone={row.ok ? 'approved' : 'rejected'}>{row.httpStatus}</Badge>
						{/if}
					{/snippet}
					{#if row.detail}<code>{row.detail}</code>{/if}
				</ListRow>
			{/each}
		</List>
	{:else}
		<p>{emptyText}</p>
	{/if}
</div>

<style>
	.deliveryLog {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-2);
	}
	code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
