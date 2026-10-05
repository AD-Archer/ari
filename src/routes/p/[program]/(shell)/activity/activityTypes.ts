export interface MentionProfile {
	name: string;
	color: string;
	slackId: string | null;
	email: string;
}

export type TextPart = { type: 'text'; text: string } | ({ type: 'user' } & MentionProfile);

export interface DetailRow {
	key: string;
	value: string;
	user?: MentionProfile;
}

export interface ActivityEntry {
	id: string;
	icon: string;
	color: string;
	action: string;
	actorName: string;
	actorColor: string;
	actorSlackId: string | null;
	text: string;
	textParts: TextPart[];
	detail: string;
	detailRows: DetailRow[];
	submissionId: string;
	href: string | null;
	when: string;
	whenLabel: string;
	iso: string;
	ageDays: number;
}

export interface ActivityLog {
	rows: ActivityEntry[];
	total: number;
}

// every action label that reaches this log, in kindMeta order. integration kinds are absent
export const actionLabels = [
	'Approved',
	'Changes',
	'Rejected',
	'Reverted',
	'Member',
	'Flag',
	'Settings',
	'Secret',
	'VM',
	'Priority',
	'Edited ship'
];

export const ageOptions: { days: number | null; label: string }[] = [
	{ days: null, label: 'All time' },
	{ days: 0, label: 'Today' },
	{ days: 7, label: 'Last 7 days' },
	{ days: 30, label: 'Last 30 days' }
];

export const systemActor = 'System';

export interface ActivityFilter {
	actions: string[];
	users: string[];
	maxAgeDays: number | null;
	search: string;
}

export function matchesFilter(entry: ActivityEntry, filter: ActivityFilter): boolean {
	const needle = filter.search.trim().toLowerCase();
	return (
		(filter.actions.length === 0 || filter.actions.includes(entry.action)) &&
		(filter.users.length === 0 || filter.users.includes(entry.actorName || systemActor)) &&
		(filter.maxAgeDays === null || entry.ageDays <= filter.maxAgeDays) &&
		(needle === '' ||
			`${entry.actorName} ${entry.text} ${entry.detail} ${entry.submissionId}`
				.toLowerCase()
				.includes(needle))
	);
}

export function countBy(entries: ActivityEntry[], keyOf: (entry: ActivityEntry) => string) {
	const counts: Record<string, number> = {};
	for (const entry of entries) counts[keyOf(entry)] = (counts[keyOf(entry)] ?? 0) + 1;
	return counts;
}
