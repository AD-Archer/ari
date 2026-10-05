import type { IconName } from '$lib/components/ui';
import type { TimelineItem } from '$lib/review/reviewTypes';

export type TimelinePerson = NonNullable<TimelineItem['who']>;
export type ActionGroup = 'submitted' | 'decision' | 'reverted' | 'vm' | 'priority' | 'edit';
export type TimeWindow = 'all' | 'day' | 'week' | 'month';

// opens and closes are session rows: off unless asked for, and not a filterable group
const groupOf: Record<TimelineItem['kind'], ActionGroup | 'opens'> = {
	submitted: 'submitted',
	opened: 'opens',
	closed: 'opens',
	approved: 'decision',
	changes: 'decision',
	rejected: 'decision',
	reverted: 'reverted',
	vmLaunch: 'vm',
	vmStop: 'vm',
	vmReap: 'vm',
	priority: 'priority',
	edit: 'edit'
};

export const actionLabels: Record<ActionGroup, string> = {
	submitted: 'Submitted',
	decision: 'Decisions',
	reverted: 'Reopened',
	vm: 'VMs',
	priority: 'Priority',
	edit: 'Edits'
};

export const windowChoices: { value: TimeWindow; label: string }[] = [
	{ value: 'all', label: 'All time' },
	{ value: 'day', label: 'Last 24h' },
	{ value: 'week', label: 'Last 7 days' },
	{ value: 'month', label: 'Last 30 days' }
];

const windowMs: Record<Exclude<TimeWindow, 'all'>, number> = {
	day: 86400000, // 24 * 60 * 60 * 1000
	week: 604800000, // 7 * 24 * 60 * 60 * 1000
	month: 2592000000 // 30 * 24 * 60 * 60 * 1000
};

export const kindIcons: Record<TimelineItem['kind'], IconName> = {
	submitted: 'inbox',
	opened: 'user',
	closed: 'logout',
	approved: 'check',
	changes: 'clock',
	rejected: 'x',
	reverted: 'refresh',
	vmLaunch: 'play',
	vmStop: 'x',
	vmReap: 'refresh',
	priority: 'star',
	edit: 'config'
};

export class ShipTimeline {
	items = $state.raw<TimelineItem[] | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	expanded = $state<Record<string, boolean>>({});

	filtersOpen = $state(false);
	hiddenPeople = $state<Record<string, boolean>>({});
	hiddenActions = $state<Record<string, boolean>>({});
	window = $state<TimeWindow>('all');
	showOpens = $state(false);

	#loadedFor: string | null = null;
	#request = 0;

	// refetched on every open, so an edit or a decision made since shows up
	async load(href: string, shipId: string): Promise<void> {
		if (this.#loadedFor !== shipId) this.items = null;
		const request = ++this.#request;
		this.loading = true;
		this.error = null;
		try {
			const response = await fetch(href);
			if (!response.ok) throw new Error(`http ${response.status}`);
			const body = (await response.json()) as { items: TimelineItem[] };
			if (request !== this.#request) return;
			this.items = body.items;
			this.#loadedFor = shipId;
		} catch {
			if (request === this.#request) this.error = 'Could not load the timeline. Try again.';
		} finally {
			if (request === this.#request) this.loading = false;
		}
	}

	reset(): void {
		this.#request += 1;
		this.#loadedFor = null;
		this.items = null;
		this.loading = false;
		this.error = null;
		this.expanded = {};
		this.filtersOpen = false;
		this.resetFilters();
	}

	resetFilters(): void {
		this.hiddenPeople = {};
		this.hiddenActions = {};
		this.window = 'all';
		this.showOpens = false;
	}

	// everyone in the feed, session rows included, so a reviewer can be hidden before opens are shown
	readonly people = $derived.by(() => {
		const seen: Record<string, TimelinePerson> = {};
		for (const item of this.items ?? [])
			if (item.who && !(item.who.name in seen)) seen[item.who.name] = item.who;
		return Object.values(seen);
	});

	readonly actionGroups = $derived.by(() => {
		const present = (this.items ?? []).map((item) => groupOf[item.kind]);
		return (Object.keys(actionLabels) as ActionGroup[]).filter((group) => present.includes(group));
	});

	readonly hasOpens = $derived((this.items ?? []).some((item) => groupOf[item.kind] === 'opens'));

	readonly shown = $derived.by(() => {
		const cutoff = this.window === 'all' ? 0 : Date.now() - windowMs[this.window];
		return (this.items ?? []).filter((item) => {
			const group = groupOf[item.kind];
			if (group === 'opens') {
				if (!this.showOpens) return false;
			} else if (this.hiddenActions[group]) return false;
			if (item.who && this.hiddenPeople[item.who.name]) return false;
			return !cutoff || Date.parse(item.iso) >= cutoff;
		});
	});

	// showing opens is a content choice, not a filter, so it is not counted
	readonly activeFilterCount = $derived(
		Object.values(this.hiddenPeople).filter(Boolean).length +
			Object.values(this.hiddenActions).filter(Boolean).length +
			(this.window === 'all' ? 0 : 1)
	);
}
