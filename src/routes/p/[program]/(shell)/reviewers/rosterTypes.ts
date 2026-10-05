import type { ProgramPermission, Track } from '$lib/data';

export { toggled, trackText } from '$lib/components/app/reviewers/access';

export interface RosterRow {
	userId: string | null;
	name: string;
	email: string;
	permissions: ProgramPermission[];
	isPoc: boolean;
	tracks: Track[];
	color: string;
	slackId: string | null;
	total: number;
	week: number;
	approvalPercent: number;
	lastSeen: string;
	pending: boolean;
}

export interface PersonSuggestion {
	email: string;
	name: string;
	color: string;
	slackId: string | null;
	member: boolean;
}

export const validEmail = (email: string) => /.+@.+\..+/.test(email);

export const accessLabel = (row: Pick<RosterRow, 'isPoc' | 'permissions'>) =>
	row.isPoc
		? 'All permissions'
		: row.permissions.length === 0
			? 'Reviewer'
			: `${row.permissions.length} permission${row.permissions.length === 1 ? '' : 's'}`;
