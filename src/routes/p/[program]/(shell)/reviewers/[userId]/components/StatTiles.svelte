<script lang="ts">
	import { ProgressBar, StatTile } from '$lib/components/ui';
	import { formatDuration } from '$lib/time';
	import type { PageData } from '../$types';

	interface Props {
		stats: PageData['stats'];
		goal: number;
		rangeActive: boolean;
	}
	let { stats, goal, rangeActive }: Props = $props();

	const percent = $derived(goal > 0 ? (stats.week / goal) * 100 : 0);
</script>

<div class="tiles">
	<StatTile
		label="This week"
		value={stats.week}
		unit="/ {goal}"
		tone={percent >= 100 ? 'ok' : percent < 40 ? 'warn' : 'neutral'}
	>
		<ProgressBar
			label="Reviews this week against the goal"
			value={stats.week}
			max={Math.max(goal, 1)}
			valueText="{stats.week} of {goal}"
			tone={percent >= 100 ? 'ok' : 'primary'}
			size="sm"
		/>
	</StatTile>
	<StatTile
		label={rangeActive ? 'Reviews in period' : 'Reviews all-time'}
		value={stats.total}
		subLabel={stats.secondPass
			? `${stats.directTotal} direct · ${stats.secondPass} second pass`
			: 'decisions made'}
	/>
	<StatTile label="Approval rate" value={stats.approvalPercent} unit="%" />
	<StatTile label="Time approved" value={formatDuration(stats.approvedSeconds)} />
	<StatTile
		label="Time reviewing"
		value={stats.timeWorked}
		subLabel="{stats.sessionCount} session{stats.sessionCount === 1 ? '' : 's'}"
	/>
	<StatTile label="VMs launched" value={stats.vmCount} />
</div>

<style>
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-3);
	}
</style>
