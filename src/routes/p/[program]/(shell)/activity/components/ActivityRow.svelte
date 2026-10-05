<script lang="ts">
	import Mention from '$lib/components/app/Mention.svelte';
	import { Avatar, Button, Icon, KeyValue, type IconName } from '$lib/components/ui';
	import type { ActivityEntry, MentionProfile } from '../activityTypes';

	interface Props {
		entry: ActivityEntry;
		backQuery: string;
	}
	let { entry, backQuery }: Props = $props();

	const uid = $props.id();
	let expanded = $state(false);

	// kindMeta colours are all var(--color-name): the name picks the bubble tone
	const tone = $derived(/--color-([a-z]+)/.exec(entry.color)?.[1] ?? 'neutral');

	const detail = $derived.by(() => {
		const users: Record<string, MentionProfile> = {};
		const seen: Record<string, number> = {};
		const items = entry.detailRows.map((row) => {
			seen[row.key] = (seen[row.key] ?? 0) + 1;
			// a ship edit can change two fields with the same label
			const key = seen[row.key] > 1 ? `${row.key} (${seen[row.key]})` : row.key;
			if (row.user) users[key] = row.user;
			return { key, value: row.value };
		});
		return { users, items: [...items, { key: 'When', value: entry.whenLabel }] };
	});
</script>

<li class="activityRow">
	<span class={['bubble', tone]}><Icon name={entry.icon as IconName} size={17} /></span>
	<div class="body">
		<div class="headline">
			{#if entry.actorName}
				<Avatar
					name={entry.actorName}
					color={entry.actorColor}
					slackId={entry.actorSlackId}
					size="sm"
					decorative
				/>
			{/if}
			<p class="text">
				{#if entry.actorName}<b>{entry.actorName}</b>&nbsp;{/if}<span class="what"
					>{#each entry.textParts as part, index (index)}{#if part.type === 'user'}<Mention
								name={part.name}
								color={part.color}
								slackId={part.slackId}
								email={part.email}
							/>{:else}{part.text}{/if}{/each}</span
				>
			</p>
		</div>
		{#if entry.detail || entry.submissionId}
			<div class="sub">
				{#if entry.detail}<span>{entry.detail}</span>{/if}
				{#if entry.submissionId}
					{#if entry.href}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the server built this path -->
						<a class="shipLink" href={`${entry.href}?${backQuery}`} title="Open submission">
							{entry.submissionId}
							<Icon name="arrowR" size={12} />
						</a>
					{:else}
						<span class="shipId">{entry.submissionId}</span>
					{/if}
				{/if}
			</div>
		{/if}
		{#if expanded}
			<div class="detail" id="{uid}-detail">
				<KeyValue items={detail.items}>
					{#snippet value(item)}
						{@const user = detail.users[item.key]}
						{#if user}
							<Mention
								name={user.name}
								color={user.color}
								slackId={user.slackId}
								email={user.email}
							/>
						{:else}
							{item.value}
						{/if}
					{/snippet}
				</KeyValue>
			</div>
		{/if}
	</div>
	<div class="side">
		<time datetime={entry.iso} title={entry.whenLabel}>{entry.when}</time>
		{#if entry.detailRows.length}
			<span class={['toggle', expanded && 'expanded']}>
				<Button
					variant="quiet"
					size="sm"
					icon="chevD"
					aria-label={expanded ? 'Hide detail' : 'Show detail'}
					aria-expanded={expanded}
					aria-controls={expanded ? `${uid}-detail` : undefined}
					onclick={() => (expanded = !expanded)}
				/>
			</span>
		{:else}
			<span class="toggle"></span>
		{/if}
	</div>
</li>

<style>
	.activityRow {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.activityRow:last-child {
		border-bottom: 0;
	}
	.bubble {
		--tone: var(--text-3);
		display: grid;
		flex: none;
		place-items: center;
		width: var(--control-md);
		height: var(--control-md);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--tone) 16%, var(--surface));
		color: var(--tone);
	}
	.green {
		--tone: var(--color-green);
	}
	.orange {
		--tone: var(--color-orange);
	}
	.red {
		--tone: var(--color-red);
	}
	.blue {
		--tone: var(--color-blue);
	}
	.yellow {
		--tone: var(--color-yellow);
	}
	.purple {
		--tone: var(--color-purple);
	}
	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
		padding-top: var(--space-1);
	}
	.headline {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		min-width: 0;
	}
	.text {
		min-width: 0;
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.6;
		overflow-wrap: anywhere;
	}
	.what {
		color: var(--text-2);
	}
	.sub {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-3);
	}
	.shipLink,
	.shipId {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font-family: var(--font-mono);
		overflow-wrap: anywhere;
	}
	.shipLink {
		color: var(--text-2);
		text-decoration: none;
	}
	.shipLink:hover {
		color: var(--primary);
	}
	.detail {
		margin-top: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.side {
		display: flex;
		flex: none;
		align-items: center;
		gap: var(--space-1);
	}
	time {
		font-size: var(--text-xs);
		color: var(--text-3);
		white-space: nowrap;
	}
	.toggle {
		display: inline-flex;
		justify-content: center;
		width: var(--control-sm);
	}
	.toggle :global(svg) {
		transition: transform 0.15s;
	}
	.expanded :global(svg) {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.toggle :global(svg) {
			transition: none;
		}
	}
</style>
