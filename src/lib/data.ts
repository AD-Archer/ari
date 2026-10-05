import type { IconName } from '$lib/components/ui';

export type Status =
	| 'processing'
	| 'pending'
	| 'approved'
	| 'changes'
	| 'rejected'
	| 'reverted'
	| 'withdrawn'
	| 'secondpass'
	| 'fraudreview';
export type Evidence = 'commits' | 'elapsed' | 'devlog';
export type Track = 'software' | 'hardware';

export const trackLabels: Record<Track, string> = { software: 'Software', hardware: 'Hardware' };
export const trackLabel = (track: Track) => trackLabels[track];
export const allTracks: Track[] = ['software', 'hardware'];

// mirrors the ProgramPermission enum in schema.prisma
export type ProgramPermission =
	| 'MANAGE_SETTINGS'
	| 'SECOND_PASS'
	| 'USE_VMS'
	| 'VIEW_REVIEWED'
	| 'VIEW_AUDIT_LOG'
	| 'VIEW_FRAUD'
	| 'VIEW_REVIEWERS'
	| 'MANAGE_REVIEWERS'
	| 'OVERRIDE_DECISIONS';

export const programPermissions: {
	key: ProgramPermission;
	label: string;
	description: string;
}[] = [
	{ key: 'VIEW_REVIEWERS', label: 'View reviewers', description: 'See the reviewers roster.' },
	{
		key: 'MANAGE_REVIEWERS',
		label: 'Manage reviewers',
		description: 'Add/remove members, edit tracks, grant permissions.'
	},
	{ key: 'MANAGE_SETTINGS', label: 'Manage settings', description: 'Change program settings.' },
	{ key: 'SECOND_PASS', label: 'Second pass', description: 'Confirm/override held decisions.' },
	{ key: 'VIEW_REVIEWED', label: 'View reviewed', description: 'See the reviewed list.' },
	{ key: 'VIEW_AUDIT_LOG', label: 'View audit log', description: 'See the activity/audit log.' },
	{
		key: 'VIEW_FRAUD',
		label: 'View fraud review',
		description: 'See fraud review + fraud flags.'
	},
	{
		key: 'OVERRIDE_DECISIONS',
		label: 'Override decisions',
		description: 'Revert, requeue, and reclassify ships.'
	},
	{ key: 'USE_VMS', label: 'Use reviewer VMs', description: 'Launch disposable VMs (if enabled).' }
];

export const allPermissions: ProgramPermission[] = programPermissions.map((entry) => entry.key);
export const permissionLabel = (permission: ProgramPermission): string =>
	programPermissions.find((entry) => entry.key === permission)?.label ?? permission;

// mirrors the OrgPermission enum in schema.prisma
export type OrgPermission =
	| 'MANAGE_PROGRAMS'
	| 'CREATE_PROGRAMS'
	| 'MANAGE_PEOPLE'
	| 'GRANT_ORG_PERMS'
	| 'VIEW_WEBHOOK_LOGS'
	| 'MANAGE_MCP'
	| 'VIEW_ALL_PROGRAMS'
	| 'OPERATE_ALL_PROGRAMS';

export const orgPermissions: { key: OrgPermission; label: string; description: string }[] = [
	{
		key: 'MANAGE_PROGRAMS',
		label: 'Manage programs',
		description: 'Create, edit, and archive programs. Only they can turn reviewer VMs on or off.'
	},
	{
		key: 'CREATE_PROGRAMS',
		label: 'Create programs',
		description: 'Create new programs only. Cannot edit or archive them, or turn on reviewer VMs.'
	},
	{
		key: 'MANAGE_PEOPLE',
		label: 'Manage people',
		description: 'See everyone, invite people, and remove them.'
	},
	{
		key: 'GRANT_ORG_PERMS',
		label: 'Grant org permissions',
		description: 'Give or revoke org permissions (only ones they hold, never their own).'
	},
	{
		key: 'VIEW_WEBHOOK_LOGS',
		label: 'View webhook logs',
		description: 'See webhook delivery logs.'
	},
	{
		key: 'MANAGE_MCP',
		label: 'Manage MCP',
		description:
			'Mint and revoke MCP tokens. Tokens only work while their owner also operates all programs.'
	},
	{
		key: 'VIEW_ALL_PROGRAMS',
		label: 'View all programs',
		description:
			'Open any program and its read-only pages. Programs they are not a member of stay off their lists until they browse all programs. Cannot review or decide.'
	},
	{
		key: 'OPERATE_ALL_PROGRAMS',
		label: 'Operate all programs',
		description: 'Full operator on every program. Includes everything view all programs grants.'
	}
];

export const allOrgPermissions: OrgPermission[] = orgPermissions.map((entry) => entry.key);
export const orgPermissionLabel = (permission: OrgPermission): string =>
	orgPermissions.find((entry) => entry.key === permission)?.label ?? permission;

// what VIEW_ALL_PROGRAMS grants inside each program: the read-only slice
export const orgViewProgramPermissions: ProgramPermission[] = [
	'VIEW_REVIEWED',
	'VIEW_AUDIT_LOG',
	'VIEW_FRAUD',
	'VIEW_REVIEWERS'
];

export const accentColors = ['#ec3750', '#ff8c37', '#f1c40f', '#33d6a6', '#338eda', '#a633d6'];

export interface Collaborator {
	makerId: string;
	name: string;
	slackId?: string | null;
}

export interface Flag {
	id?: string;
	severity: 'warn' | 'danger';
	text: string;
	title: string;
	what: string;
	matched: { key: string; value: string }[];
	action: string;
}

export const statusLabels: Record<Status, string> = {
	processing: 'Processing',
	pending: 'Pending',
	approved: 'Approved',
	changes: 'Changes',
	rejected: 'Rejected',
	reverted: 'Reverted',
	withdrawn: 'Withdrawn',
	secondpass: 'Second pass',
	fraudreview: 'Fraud Review'
};
export const labelOf = (status: Status) => statusLabels[status];

export const evidenceIcon = (evidence: Evidence): IconName =>
	evidence === 'commits' ? 'commit' : evidence === 'elapsed' ? 'film' : 'book';
export const evidenceLabel = (evidence: Evidence) =>
	evidence === 'commits' ? 'Commits' : evidence === 'elapsed' ? 'Elapsed' : 'Devlog';
