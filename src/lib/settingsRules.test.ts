import { expect, test } from 'bun:test';
import {
	fieldKeyFor,
	normalizeTools,
	parseReauthTtl,
	parseReviewGoal,
	slugName,
	splitOptions,
	validateSettings,
	validateTools,
	type SettingsValues
} from './settingsRules';

const valid: SettingsValues = {
	displayName: 'Lighthouse',
	iconUrl: '',
	cardBgUrl: '',
	trackingStartsAt: '',
	accepts: { commits: true, elapsed: false, devlog: false },
	collaborative: false,
	secondPass: false,
	secondPassApproved: true,
	secondPassChanges: true,
	secondPassRejected: true,
	secondPassOrganizerBypass: true,
	screenIdentity: true,
	screenHackatime: true,
	reviewersCannotReviewOwnProjects: false,
	allowDeflation: true,
	hoursJustification: true,
	reviewerReauth: false,
	reviewerReauthTtlMinutes: '60',
	priorityReview: false,
	priorityReviewMessage: '',
	reviewGoal: '50',
	reviewersChannel: '',
	outUrl: '',
	outEnabled: true
};

const withValues = (changes: Partial<SettingsValues>) => validateSettings({ ...valid, ...changes });

test('a complete set of settings passes', () => {
	expect(validateSettings(valid)).toBeNull();
});

test('each scalar rule refuses with its own message', () => {
	expect(withValues({ displayName: '   ' })).toBe('Display name is required.');
	expect(withValues({ iconUrl: 'ftp://x/icon.png' })).toBe(
		'Icon URL must start with http:// or https://'
	);
	expect(withValues({ cardBgUrl: 'javascript:alert(1)' })).toBe(
		'Card background URL must start with http:// or https://'
	);
	expect(withValues({ priorityReviewMessage: 'x'.repeat(2001) })).toBe(
		'The priority form message is too long (2000 max).'
	);
	expect(withValues({ priorityReviewMessage: 'x'.repeat(2000) })).toBeNull();
	expect(withValues({ trackingStartsAt: '10/03/2026' })).toBe(
		'Tracking start date must be YYYY-MM-DD.'
	);
	expect(withValues({ trackingStartsAt: '2026-13-40' })).toBe(
		'Tracking start date is not a valid date.'
	);
	expect(withValues({ trackingStartsAt: '2026-10-03' })).toBeNull();
	expect(withValues({ outUrl: 'hooks.example.test' })).toBe(
		'Webhook URL must start with http:// or https://'
	);
});

test('the review goal is a whole number from 1 to 10000', () => {
	for (const bad of ['', '0', '-1', '2.5', '10001', 'ten']) {
		expect(withValues({ reviewGoal: bad })).toBe(
			'Weekly review goal must be a whole number between 1 and 10000.'
		);
	}
	expect(parseReviewGoal(' 10000 ')).toBe(10000);
	expect(parseReviewGoal('1')).toBe(1);
});

test('the reauth window is only checked while the gate is on', () => {
	expect(withValues({ reviewerReauth: false, reviewerReauthTtlMinutes: 'soon' })).toBeNull();
	expect(withValues({ reviewerReauth: true, reviewerReauthTtlMinutes: '0' })).toBe(
		'Reauth inactivity timeout must be a whole number of minutes between 1 and 100000.'
	);
	expect(withValues({ reviewerReauth: true, reviewerReauthTtlMinutes: '100000' })).toBeNull();
	expect(parseReauthTtl('100001')).toBeNull();
	expect(parseReauthTtl('1.5')).toBeNull();
});

test('slugs and option lists are normalized', () => {
	expect(fieldKeyFor('', 'Eligible for Grand Prize!')).toBe('eligible_for_grand_prize');
	expect(fieldKeyFor(' Grand Prize ', 'ignored')).toBe('grand_prize');
	expect(fieldKeyFor('', '!!!')).toBe('field');
	expect(slugName('  Thanks A Lot! ')).toBe('thanks-a-lot');
	expect(slugName('x'.repeat(60))).toHaveLength(40);
	expect(splitOptions(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
});

test('tools are normalized from untrusted json', () => {
	const tools = normalizeTools({
		checklist: [{ id: 7, label: '  Has a README ', tracks: ['hardware', 'software', 'other'] }],
		fields: [
			{
				id: 'new-1',
				type: 'dropdown',
				label: ' Difficulty ',
				key: '',
				options: ['a'],
				required: 'yes',
				tracks: 'software'
			},
			{ type: 'select', label: 'Level', options: [' Low ', '', 'High'], tracks: ['software'] },
			'not an object'
		],
		snippets: 'nope'
	});
	expect(tools.checklist).toEqual([
		{ id: '', label: 'Has a README', tracks: ['software', 'hardware'] }
	]);
	expect(tools.fields).toEqual([
		{
			id: 'new-1',
			type: 'checkbox',
			label: 'Difficulty',
			description: null,
			key: 'difficulty',
			options: [],
			required: false,
			tracks: []
		},
		{
			id: '',
			type: 'select',
			label: 'Level',
			description: null,
			key: 'level',
			options: ['Low', 'High'],
			required: false,
			tracks: ['software']
		}
	]);
	expect(tools.snippets).toEqual([]);
});

test('tools validation names the offending row', () => {
	const check = (raw: Parameters<typeof normalizeTools>[0]) => validateTools(normalizeTools(raw));
	const none = { checklist: [], fields: [], snippets: [] };
	expect(check(none)).toBeNull();
	expect(check({ ...none, checklist: [{ label: ' ', tracks: ['software'] }] })).toBe(
		'Every checklist item needs a label.'
	);
	expect(check({ ...none, checklist: [{ label: 'Demo works', tracks: [] }] })).toBe(
		'"Demo works" needs at least one track.'
	);
	expect(check({ ...none, fields: [{ label: '', tracks: ['software'] }] })).toBe(
		'Every review field needs a title.'
	);
	expect(check({ ...none, fields: [{ label: 'Level', tracks: [] }] })).toBe(
		'"Level" needs at least one track.'
	);
	expect(
		check({
			...none,
			fields: [
				{ label: 'Level', tracks: ['software'] },
				{ label: 'Other', key: 'LEVEL', tracks: ['hardware'] }
			]
		})
	).toBe('Two review fields share the value name "level". Give each its own.');
	expect(check({ ...none, snippets: [{ name: '!!', body: 'text' }] })).toBe(
		'Every snippet needs a name.'
	);
	expect(check({ ...none, snippets: [{ name: 'demo', body: ' ' }] })).toBe(
		'Snippet /demo needs text.'
	);
	expect(check({ ...none, snippets: [{ name: 'demo', body: 'x'.repeat(5001) }] })).toBe(
		'Snippet /demo is too long (5000 max).'
	);
	expect(
		check({
			...none,
			snippets: [
				{ name: 'Demo', body: 'one' },
				{ name: 'demo ', body: 'two' }
			]
		})
	).toBe('Two snippets are both named /demo.');
});
