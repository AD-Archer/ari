import { describe, expect, test } from 'bun:test';
import { allPermissions } from '$lib/data';
import { canOpenAdmin, visibleAdminSections } from '$lib/adminNav';
import { activeProgramTab, programNavTabs, type ProgramNavInput } from '$lib/programNav';

const input = (overrides: Partial<ProgramNavInput> = {}): ProgramNavInput => ({
	programId: 'programOne',
	permissions: [],
	pending: 0,
	secondPass: false,
	secondPassPending: 0,
	privateTabs: [],
	...overrides
});
const values = (overrides: Partial<ProgramNavInput> = {}) =>
	programNavTabs(input(overrides)).map((tab) => tab.value);

describe('programNavTabs', () => {
	test('a member with no permissions sees only the reviewer tabs', () => {
		expect(values({ secondPass: true, secondPassPending: 4 })).toEqual([
			'overview',
			'queue',
			'reviewed'
		]);
	});

	test('every permission shows every tab, in order', () => {
		expect(values({ permissions: allPermissions, secondPass: true })).toEqual([
			'overview',
			'queue',
			'reviewed',
			'secondpass',
			'activity',
			'reviewers',
			'settings'
		]);
	});

	test('second pass stays while held ships linger after the setting is off', () => {
		expect(values({ permissions: ['SECOND_PASS'] })).not.toContain('secondpass');
		expect(values({ permissions: ['SECOND_PASS'], secondPassPending: 1 })).toContain('secondpass');
	});

	test('each elevated tab needs its own permission', () => {
		expect(values({ permissions: ['VIEW_AUDIT_LOG'] })).toEqual([
			'overview',
			'queue',
			'reviewed',
			'activity'
		]);
		expect(values({ permissions: ['VIEW_REVIEWERS'] }).at(-1)).toBe('reviewers');
		expect(values({ permissions: ['MANAGE_SETTINGS'] }).at(-1)).toBe('settings');
	});

	test('zero counts are left off and provider tabs sit before the audit log', () => {
		const tabs = programNavTabs(
			input({
				permissions: ['VIEW_AUDIT_LOG'],
				pending: 0,
				privateTabs: [
					{ href: '/p/programOne/extra', label: 'Extra', icon: 'unknownIcon', badgeCount: 2 }
				]
			})
		);
		expect(tabs.find((tab) => tab.value === 'queue')?.count).toBeUndefined();
		expect(tabs.map((tab) => tab.value)).toEqual([
			'overview',
			'queue',
			'reviewed',
			'extra',
			'activity'
		]);
		expect(tabs.find((tab) => tab.value === 'extra')).toMatchObject({ icon: 'shield', count: 2 });
	});
});

describe('activeProgramTab', () => {
	test('maps the path to a tab value', () => {
		expect(activeProgramTab('/p/programOne', 'programOne')).toBe('overview');
		expect(activeProgramTab('/p/programOne/queue', 'programOne')).toBe('queue');
		expect(activeProgramTab('/p/programOne/reviewers/someUser', 'programOne')).toBe('reviewers');
	});
});

describe('admin sections', () => {
	test('program reach alone does not open the admin frame', () => {
		expect(canOpenAdmin(['VIEW_ALL_PROGRAMS', 'OPERATE_ALL_PROGRAMS'])).toBe(false);
		expect(canOpenAdmin(['VIEW_WEBHOOK_LOGS'])).toBe(true);
		expect(canOpenAdmin(['CREATE_PROGRAMS'])).toBe(true);
	});

	test('each section shows only with one of its permissions', () => {
		const ids = (held: Parameters<typeof visibleAdminSections>[0]) =>
			visibleAdminSections(held).map((section) => section.id);
		expect(ids([])).toEqual([]);
		expect(ids(['GRANT_ORG_PERMS'])).toEqual(['people']);
		expect(ids(['MANAGE_MCP', 'VIEW_WEBHOOK_LOGS'])).toEqual(['webhooks', 'mcp']);
		expect(ids(['MANAGE_PROGRAMS'])).toEqual(['programs']);
		expect(ids(['CREATE_PROGRAMS', 'MANAGE_MCP'])).toEqual(['programs', 'mcp']);
	});
});
