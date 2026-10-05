import { iconPaths, type IconName } from '$lib/components/ui/iconPaths';
import type { ProgramPermission } from '$lib/data';
import type { NavTab } from '$lib/privateApi';

export interface ProgramNavTab {
	value: string;
	label: string;
	icon: IconName;
	href: string;
	count?: number;
}

export interface ProgramNavInput {
	programId: string;
	permissions: ProgramPermission[];
	pending: number;
	secondPass: boolean;
	secondPassPending: number;
	privateTabs: NavTab[];
}

const lastSegment = (href: string) => href.split('?')[0].split('/').filter(Boolean).at(-1) ?? href;

// every tab is gated by the permission its page enforces: hidden here means refused there
export function programNavTabs(input: ProgramNavInput): ProgramNavTab[] {
	const base = `/p/${input.programId}`;
	const can = (permission: ProgramPermission) => input.permissions.includes(permission);
	const tabs: ProgramNavTab[] = [
		{ value: 'overview', label: 'Overview', icon: 'grid', href: base },
		{
			value: 'queue',
			label: 'Needs review',
			icon: 'inbox',
			href: `${base}/queue`,
			count: input.pending || undefined
		},
		{ value: 'reviewed', label: 'Reviewed', icon: 'checkCircle', href: `${base}/reviewed` }
	];
	// stays while held approvals linger after the setting is switched off, so none strand
	if (can('SECOND_PASS') && (input.secondPass || input.secondPassPending > 0)) {
		tabs.push({
			value: 'secondpass',
			label: 'Second pass',
			icon: 'shield',
			href: `${base}/secondpass`,
			count: input.secondPassPending || undefined
		});
	}
	for (const tab of input.privateTabs) {
		tabs.push({
			value: lastSegment(tab.href),
			label: tab.label,
			icon: tab.icon in iconPaths ? (tab.icon as IconName) : 'shield',
			href: tab.href,
			count: tab.badgeCount || undefined
		});
	}
	if (can('VIEW_AUDIT_LOG')) {
		tabs.push({ value: 'activity', label: 'Audit log', icon: 'chart', href: `${base}/activity` });
	}
	if (can('VIEW_REVIEWERS')) {
		tabs.push({ value: 'reviewers', label: 'Reviewers', icon: 'user', href: `${base}/reviewers` });
	}
	if (can('MANAGE_SETTINGS')) {
		tabs.push({ value: 'settings', label: 'Settings', icon: 'config', href: `${base}/settings` });
	}
	return tabs;
}

// the first path segment after /p/{program}: '' is the overview
export function activeProgramTab(pathname: string, programId: string): string {
	const rest = pathname.slice(`/p/${programId}`.length);
	return rest.split('/').filter(Boolean)[0] ?? 'overview';
}
