import { expect, test } from 'bun:test';
import { diffSettings, parseSettingsForm, type PriorSettings } from './saveForm';

function formWith(entries: Record<string, string>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		displayName: 'Lighthouse',
		reviewGoal: '50',
		...entries
	})) {
		form.set(key, value);
	}
	return form;
}

const parsed = (entries: Record<string, string> = {}) => {
	const result = parseSettingsForm(formWith(entries));
	if (!result.ok) throw new Error(result.error);
	return result.settings;
};

const prior: PriorSettings = {
	name: 'Lighthouse',
	iconUrl: null,
	cardBgUrl: null,
	accepts: ['commits'],
	trackingStartsAt: null,
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
	reviewerReauthTtlMinutes: 60,
	priorityReview: false,
	priorityReviewMessage: null,
	priorityReviewToken: null,
	weeklyReviewGoal: 50,
	reviewersChannelId: null
};

const unchangedForm = {
	accept_commits: 'on',
	secondPassApproved: 'on',
	secondPassChanges: 'on',
	secondPassRejected: 'on',
	secondPassOrganizerBypass: 'on',
	screenIdentity: 'on',
	screenHackatime: 'on',
	allowDeflation: 'on',
	hoursJustification: 'on',
	reviewerReauthTtlMinutes: '60',
	outEnabled: 'on'
};

const diffOf = (
	entries: Record<string, string>,
	extra: { reviewersChannelId?: string | null; priorityTokenMinted?: boolean } = {},
	outbound: { url: string | null; enabled: boolean } | null = null
) => {
	const settings = parsed({ ...unchangedForm, ...entries });
	return diffSettings(prior, outbound, {
		settings,
		reauthTtlMinutes: settings.reauthTtlMinutes ?? prior.reviewerReauthTtlMinutes,
		reviewersChannelId: extra.reviewersChannelId ?? null,
		priorityTokenMinted: extra.priorityTokenMinted ?? false
	});
};

test('toggles are on only for the literal "on" and text is trimmed', () => {
	const settings = parsed({
		displayName: '  Lighthouse  ',
		accept_commits: 'on',
		accept_devlog: 'true',
		collaborative: 'on',
		secondPass: '',
		outEnabled: '',
		trackingStartsAt: ' 2026-10-03 ',
		reviewGoal: ' 75 '
	});
	expect(settings.values.displayName).toBe('Lighthouse');
	expect(settings.accepts).toEqual(['commits']);
	expect(settings.values.collaborative).toBe(true);
	expect(settings.values.secondPass).toBe(false);
	expect(settings.values.outEnabled).toBe(false);
	expect(settings.trackingStartsAt?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
	expect(settings.reviewGoal).toBe(75);
});

test('an unusable reauth window parses to null while the gate is off and is refused while on', () => {
	expect(parsed({ reviewerReauthTtlMinutes: 'abc' }).reauthTtlMinutes).toBeNull();
	expect(parsed({ reviewerReauth: 'on', reviewerReauthTtlMinutes: '45' }).reauthTtlMinutes).toBe(
		45
	);
	expect(
		parseSettingsForm(formWith({ reviewerReauth: 'on', reviewerReauthTtlMinutes: '' }))
	).toEqual({
		ok: false,
		error: 'Reauth inactivity timeout must be a whole number of minutes between 1 and 100000.'
	});
});

test('a missing display name or goal refuses the form', () => {
	expect(parseSettingsForm(formWith({ displayName: ' ' }))).toEqual({
		ok: false,
		error: 'Display name is required.'
	});
	expect(parseSettingsForm(formWith({ reviewGoal: '' }))).toEqual({
		ok: false,
		error: 'Weekly review goal must be a whole number between 1 and 10000.'
	});
});

test('a form matching the stored settings records no change', () => {
	expect(diffOf({})).toEqual({ changed: [], diff: {} });
});

test('every changed setting is named once, with from and to', () => {
	const { changed, diff } = diffOf(
		{
			displayName: 'Lighthouse Two',
			iconUrl: 'https://example.com/icon.png',
			accept_devlog: 'on',
			trackingStartsAt: '2026-10-03',
			collaborative: 'on',
			secondPass: 'on',
			secondPassApproved: '',
			secondPassChanges: '',
			secondPassRejected: '',
			secondPassOrganizerBypass: '',
			screenIdentity: '',
			screenHackatime: '',
			reviewersCannotReviewOwnProjects: 'on',
			allowDeflation: '',
			hoursJustification: '',
			reviewerReauth: 'on',
			reviewerReauthTtlMinutes: '45',
			priorityReview: 'on',
			priorityReviewMessage: 'm'.repeat(200),
			reviewGoal: '75',
			outUrl: 'https://hooks.example.test/path?token=secret',
			outEnabled: ''
		},
		{ reviewersChannelId: 'C0123ABCDEF', priorityTokenMinted: true }
	);
	expect(changed).toEqual([
		'name',
		'branding',
		'evidence',
		'tracking start',
		'collaborative projects',
		'second pass review',
		'second pass · approvals',
		'second pass · changes requests',
		'second pass · rejections',
		'second pass · organizer bypass',
		'identity screening',
		'Hackatime screening',
		'reviewers cannot review own projects',
		'hour deflation',
		'hours justification',
		'reviewer reauthentication',
		'reauth inactivity timeout',
		'priority review',
		'priority form message',
		'priority form link minted',
		'weekly review goal',
		'reviewers channel',
		'webhook URL',
		'webhook enabled'
	]);
	expect(diff.name).toEqual({ from: 'Lighthouse', to: 'Lighthouse Two' });
	expect(diff.branding).toEqual({
		icon: { from: null, to: 'https://example.com/icon.png' },
		cardBg: { from: null, to: null }
	});
	expect(diff.evidence).toEqual({ from: ['commits'], to: ['commits', 'devlog'] });
	expect(diff.trackingStartsAt).toEqual({ from: null, to: '2026-10-03' });
	expect(diff.secondPassApproved).toEqual({ from: true, to: false });
	expect(diff.reviewerReauthTtlMinutes).toEqual({ from: 60, to: 45 });
	expect(diff.weeklyReviewGoal).toEqual({ from: 50, to: 75 });
	expect(diff.reviewersChannelId).toEqual({ from: null, to: 'C0123ABCDEF' });
	expect(diff.outEnabled).toEqual({ from: true, to: false });
});

test('the audit diff never carries the webhook path, the full message or the form token', () => {
	const { diff } = diffOf(
		{
			priorityReview: 'on',
			priorityReviewMessage: 'm'.repeat(200),
			outUrl: 'https://hooks.example.test/path?token=secret'
		},
		{ priorityTokenMinted: true },
		{ url: 'https://old.example.test/hook/abc', enabled: true }
	);
	expect(diff.outUrl).toEqual({
		from: 'https://old.example.test',
		to: 'https://hooks.example.test'
	});
	expect(diff.priorityReviewMessage).toEqual({ from: null, to: 'm'.repeat(120) });
	expect(JSON.stringify(diff)).not.toContain('secret');
	expect(Object.keys(diff)).not.toContain('priorityReviewToken');
});

test('evidence order alone is not a change', () => {
	const settings = parsed({ ...unchangedForm, accept_devlog: 'on' });
	const result = diffSettings({ ...prior, accepts: ['devlog', 'commits'] }, null, {
		settings,
		reauthTtlMinutes: 60,
		reviewersChannelId: null,
		priorityTokenMinted: false
	});
	expect(result.changed).toEqual([]);
});
