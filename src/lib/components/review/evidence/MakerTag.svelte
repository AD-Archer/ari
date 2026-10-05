<script lang="ts">
	import { Avatar } from '$lib/components/ui';
	import { useReview } from '$lib/review/state/reviewPage.svelte';

	interface Props {
		makerId: string | null;
		name: string;
	}
	let { makerId, name }: Props = $props();

	const { context } = useReview();
	const slackId = $derived(
		context.data.collaborators?.find((person) => person.makerId === makerId)?.slackId ?? null
	);
</script>

<span class="makerTag"><Avatar {name} {slackId} size="sm" decorative />{name}</span>

<style>
	.makerTag {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-2);
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}
</style>
