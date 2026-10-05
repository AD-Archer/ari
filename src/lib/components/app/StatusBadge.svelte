<script lang="ts">
	import { Badge } from '$lib/components/ui';
	import { labelOf, type Status } from '$lib/data';

	interface Props {
		status: Status;
		dot?: boolean;
	}
	let { status, dot = true }: Props = $props();
</script>

<Badge tone={status} {dot}>{labelOf(status)}</Badge>
