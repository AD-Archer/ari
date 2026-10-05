<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, DatePicker, SegmentedControl } from '$lib/components/ui';
	import { addDays, todayIso } from '$lib/components/ui/dateGrid';
	import type { PageData } from '../$types';

	interface Props {
		range: PageData['range'];
	}
	let { range }: Props = $props();

	// the numbered presets are day counts
	type Preset = 'all' | '7' | '30' | '90' | 'custom';
	// a preset covers today and the days before it, so 7 days starts 6 days back
	const presetStart = (days: number) => addDays(todayIso(), 1 - days);

	const activePreset = $derived.by<Preset>(() => {
		if (!range.active) return 'all';
		if (range.to !== todayIso()) return 'custom';
		for (const preset of ['7', '30', '90'] as const) {
			if (range.from === presetStart(Number(preset))) return preset;
		}
		return 'custom';
	});

	const dayFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayLabel = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`));
	const rangeLabel = $derived(
		range.from && range.to
			? `${dayLabel(range.from)} to ${dayLabel(range.to)}`
			: range.from
				? `since ${dayLabel(range.from)}`
				: range.to
					? `through ${dayLabel(range.to)}`
					: ''
	);

	function apply(from: string | null, to: string | null) {
		// the tab param is written with replaceState, so the address bar is the only current copy
		const kept = [...new URLSearchParams(location.search)].filter(
			([key]) => key !== 'from' && key !== 'to'
		);
		if (from) kept.push(['from', from]);
		if (to) kept.push(['to', to]);
		const query = new URLSearchParams(kept).toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current pathname is already resolved
		return goto(query ? `${location.pathname}?${query}` : location.pathname, {
			keepFocus: true,
			noScroll: true
		});
	}

	function applyPreset(preset: Preset) {
		if (preset === 'all') apply(null, null);
		else if (preset !== 'custom') apply(presetStart(Number(preset)), todayIso());
	}

	let draftFrom = $derived(range.from ?? '');
	let draftTo = $derived(range.to ?? '');
	let applyQueued = false;

	// the picker writes from and to one after the other: one navigation for both
	function pickerChanged() {
		if (applyQueued) return;
		applyQueued = true;
		queueMicrotask(() => {
			applyQueued = false;
			if (draftFrom !== (range.from ?? '') || draftTo !== (range.to ?? '')) {
				apply(draftFrom || null, draftTo || null);
			}
		});
	}
</script>

<div class="filter">
	<SegmentedControl
		label="Period"
		size="sm"
		options={[
			{ value: 'all', label: 'All time' },
			{ value: '7', label: '7 days' },
			{ value: '30', label: '30 days' },
			{ value: '90', label: '90 days' }
		]}
		bind:value={() => activePreset, applyPreset}
	/>
	<div class="picker">
		<DatePicker
			label="Custom period"
			range
			placeholder="Custom period"
			max={todayIso()}
			bind:from={
				() => draftFrom,
				(next) => {
					draftFrom = next;
					pickerChanged();
				}
			}
			bind:to={
				() => draftTo,
				(next) => {
					draftTo = next;
					pickerChanged();
				}
			}
		/>
	</div>
	{#if range.active}
		<span class="note">
			Showing reviews {rangeLabel}
			<Button variant="quiet" size="sm" icon="x" onclick={() => apply(null, null)}>Clear</Button>
		</span>
	{/if}
</div>

<style>
	.filter {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
	}
	.picker {
		min-width: 0;
	}
	.note {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--space-6);
		font-size: var(--text-sm);
		color: var(--text-2);
	}
</style>
