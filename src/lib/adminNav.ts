import type { IconName } from '$lib/components/ui';
import type { OrgPermission } from '$lib/data';

export interface AdminSection {
	id: string;
	label: string;
	icon: IconName;
	href: string;
	anyOf: OrgPermission[];
}

export const adminSections: AdminSection[] = [
	{
		id: 'programs',
		label: 'Programs',
		icon: 'grid',
		href: '/admin',
		anyOf: ['MANAGE_PROGRAMS', 'CREATE_PROGRAMS']
	},
	{
		id: 'people',
		label: 'People',
		icon: 'user',
		href: '/admin/people',
		anyOf: ['MANAGE_PEOPLE', 'GRANT_ORG_PERMS']
	},
	{
		id: 'webhooks',
		label: 'Webhooks',
		icon: 'external',
		href: '/admin/webhooks',
		anyOf: ['VIEW_WEBHOOK_LOGS']
	},
	{ id: 'mcp', label: 'MCP', icon: 'lock', href: '/admin/mcp', anyOf: ['MANAGE_MCP'] }
];

// program reach (view/operate all) does not open the admin section
export const adminPagePermissions: OrgPermission[] = [
	'MANAGE_PROGRAMS',
	'CREATE_PROGRAMS',
	'MANAGE_PEOPLE',
	'GRANT_ORG_PERMS',
	'VIEW_WEBHOOK_LOGS',
	'MANAGE_MCP'
];

// managing programs implies creating them, mirroring hasOrgPermission on the server
const holds = (held: OrgPermission[], permission: OrgPermission) =>
	held.includes(permission) ||
	(permission === 'CREATE_PROGRAMS' && held.includes('MANAGE_PROGRAMS'));

export const visibleAdminSections = (held: OrgPermission[]): AdminSection[] =>
	adminSections.filter((section) => section.anyOf.some((permission) => holds(held, permission)));

export const canOpenAdmin = (held: OrgPermission[]): boolean =>
	adminPagePermissions.some((permission) => holds(held, permission));
