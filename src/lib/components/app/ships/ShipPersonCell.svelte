<script lang="ts">
	import { Avatar, AvatarStack } from '$lib/components/ui';
	import type { Collaborator } from '$lib/data';

	interface Props {
		name: string;
		color?: string;
		slackId?: string | null;
		collaborators?: Collaborator[];
		detail?: string;
	}
	let { name, color, slackId = null, collaborators, detail }: Props = $props();
</script>

<span class="shipPerson">
	{#if collaborators?.length}
		<AvatarStack
			size="sm"
			people={collaborators.map((person) => ({
				name: person.name,
				slackId: person.slackId,
				color
			}))}
		/>
	{:else}
		<Avatar {name} {color} {slackId} size="sm" decorative />
	{/if}
	<span class="copy">
		<span class="name" title={name}>{name}</span>
		{#if detail}<span class="detail">{detail}</span>{/if}
	</span>
</span>

<style>
	.shipPerson {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}
	.copy {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		color: var(--text);
	}
	.detail {
		font-size: var(--text-xs);
		color: var(--text-3);
		white-space: nowrap;
	}
</style>
