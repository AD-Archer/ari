import { afterAll, beforeAll, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { actions, load } from '../../../routes/p/[program]/(shell)/settings/+page.server';
import { loadSettings } from './load';
import { saveSettings } from './save';
import { formOf, settingsFixtures } from './settingsTestFixtures';

const {
	prefix,
	programId,
	organizer,
	member,
	outsider,
	orgAdmin,
	programRow,
	settingsEvents,
	createUsers,
	cleanUp
} = settingsFixtures('settingsSaveTest');

const everySetting = {
	displayName: `${prefix} renamed`,
	iconUrl: 'https://example.com/icon.png',
	cardBgUrl: 'https://example.com/card.png',
	trackingStartsAt: '2026-09-01',
	accept_commits: 'on',
	accept_devlog: 'on',
	collaborative: 'on',
	secondPass: 'on',
	secondPassApproved: 'on',
	reviewersCannotReviewOwnProjects: 'on',
	hoursJustification: 'on',
	reviewerReauth: 'on',
	reviewerReauthTtlMinutes: '45',
	priorityReview: 'on',
	priorityReviewMessage: 'Only when a deadline is close.',
	reviewGoal: '75',
	reviewersChannel: '',
	outUrl: 'https://hooks.example.test/settings-test?token=abc',
	outEnabled: ''
};

beforeAll(async () => {
	await createUsers();
	await db.program.create({
		data: {
			id: programId,
			name: `${prefix} program`,
			color: '#338eda',
			accepts: ['commits', 'elapsed'],
			fraudReviewMethod: 'gate',
			fraudEventId: 'event-1',
			fraudApiKeyEnc: 'sealed',
			fraudApiKeyLast4: 'abcd',
			fraudWebhookToken: `${prefix}FraudToken`,
			flagRules: { create: { kind: 'NO_README', enabled: true } }
		}
	});
});

afterAll(cleanUp);

test('a full save writes every setting, loads back the same and logs one SETTINGS event', async () => {
	expect(await saveSettings(programId, organizer, formOf(everySetting))).toEqual({ ok: true });

	const program = await programRow();
	expect(program).toMatchObject({
		name: `${prefix} renamed`,
		iconUrl: 'https://example.com/icon.png',
		cardBgUrl: 'https://example.com/card.png',
		accepts: ['commits', 'devlog'],
		collaborative: true,
		secondPass: true,
		secondPassApproved: true,
		secondPassChanges: false,
		secondPassRejected: false,
		secondPassOrganizerBypass: false,
		screenIdentity: false,
		screenHackatime: false,
		reviewersCannotReviewOwnProjects: true,
		allowDeflation: false,
		hoursJustification: true,
		reviewerReauth: true,
		reviewerReauthTtlMinutes: 45,
		priorityReview: true,
		priorityReviewMessage: 'Only when a deadline is close.',
		weeklyReviewGoal: 75,
		reviewersChannelId: null
	});
	expect(program.trackingStartsAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
	expect(program.priorityReviewToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
	expect(await db.outboundEndpoint.findUnique({ where: { programId } })).toMatchObject({
		url: 'https://hooks.example.test/settings-test?token=abc',
		enabled: false
	});

	const events = await settingsEvents();
	expect(events).toHaveLength(1);
	expect(events[0].actorId).toBe(organizer.id);
	const meta = events[0].meta as { changed: string[]; diff: Record<string, unknown> };
	expect(meta.changed).toEqual([
		'name',
		'branding',
		'evidence',
		'tracking start',
		'collaborative projects',
		'second pass review',
		'second pass · changes requests',
		'second pass · rejections',
		'second pass · organizer bypass',
		'identity screening',
		'Hackatime screening',
		'reviewers cannot review own projects',
		'hour deflation',
		'reviewer reauthentication',
		'reauth inactivity timeout',
		'priority review',
		'priority form message',
		'priority form link minted',
		'weekly review goal',
		'webhook URL',
		'webhook enabled'
	]);
	expect(events[0].text).toBe(`Updated settings · ${meta.changed.join(', ')}`);
	expect(meta.diff.outUrl).toEqual({ from: '', to: 'https://hooks.example.test' });
	expect(JSON.stringify(meta)).not.toContain(program.priorityReviewToken ?? 'missing');

	const loaded = await loadSettings(programId, organizer, 'http://localhost:5173');
	expect(loaded.settings).toEqual({
		displayName: `${prefix} renamed`,
		iconUrl: 'https://example.com/icon.png',
		cardBgUrl: 'https://example.com/card.png',
		trackingStartsAt: '2026-09-01',
		accepts: { commits: true, elapsed: false, devlog: true },
		collaborative: true,
		secondPass: true,
		secondPassApproved: true,
		secondPassChanges: false,
		secondPassRejected: false,
		secondPassOrganizerBypass: false,
		screenIdentity: false,
		screenHackatime: false,
		reviewersCannotReviewOwnProjects: true,
		allowDeflation: false,
		hoursJustification: true,
		reviewerReauth: true,
		reviewerReauthTtlMinutes: '45',
		priorityReview: true,
		priorityReviewMessage: 'Only when a deadline is close.',
		reviewGoal: '75',
		reviewersChannel: '',
		outUrl: 'https://hooks.example.test/settings-test?token=abc',
		outEnabled: false
	});
	expect(loaded.priorityFormUrl).toEndWith(`/priority/${program.priorityReviewToken}`);
	expect(loaded.canDisableJustification).toBe(false);
});

test('saving the same values again changes nothing and logs nothing', async () => {
	const before = await programRow();
	expect(await saveSettings(programId, organizer, formOf(everySetting))).toEqual({ ok: true });
	const after = await programRow();
	expect(after.priorityReviewToken).toBe(before.priorityReviewToken);
	expect(await settingsEvents()).toHaveLength(1);
});

test('the public save leaves fraud review and flag rules untouched', async () => {
	const program = await programRow();
	expect(program).toMatchObject({
		fraudReviewMethod: 'gate',
		fraudEventId: 'event-1',
		fraudApiKeyEnc: 'sealed',
		fraudApiKeyLast4: 'abcd',
		fraudWebhookToken: `${prefix}FraudToken`
	});
	expect(await db.flagRule.findMany({ where: { programId } })).toMatchObject([
		{ kind: 'NO_README', enabled: true }
	]);
});

test('turning the reauth gate off keeps the stored window when the posted one is unusable', async () => {
	const form = { ...everySetting, reviewerReauth: '', reviewerReauthTtlMinutes: 'soon' };
	expect(await saveSettings(programId, organizer, formOf(form))).toEqual({ ok: true });
	expect(await programRow()).toMatchObject({ reviewerReauth: false, reviewerReauthTtlMinutes: 45 });
	const events = await settingsEvents();
	expect(events.at(-1)?.text).toBe('Updated settings · reviewer reauthentication');
});

test('hours justification is only turned off by someone who can manage programs', async () => {
	const form = formOf({ ...everySetting, reviewerReauth: '', hoursJustification: '' });
	expect(await saveSettings(programId, organizer, form)).toEqual({
		ok: false,
		status: 403,
		error: 'Hours justification can only be turned off by an org admin who can manage programs.'
	});
	expect((await programRow()).hoursJustification).toBe(true);

	expect(await saveSettings(programId, orgAdmin, form)).toEqual({ ok: true });
	expect((await programRow()).hoursJustification).toBe(false);
	const events = await settingsEvents();
	expect(events.at(-1)).toMatchObject({
		actorId: orgAdmin.id,
		text: 'Updated settings · hours justification'
	});
});

test('refused saves write nothing', async () => {
	const before = await settingsEvents();
	const attempts: [Record<string, string>, string][] = [
		[{ displayName: '' }, 'Display name is required.'],
		[
			{ reviewersChannel: 'general' },
			'Reviewers channel must be a Slack channel id (like C0123ABCDEF) or a link to the channel.'
		],
		[
			{ outUrl: 'http://127.0.0.1:8080/hook' },
			'That webhook host is not allowed. Use a public address, not localhost or a private/internal one.'
		],
		[{ reviewGoal: '0' }, 'Weekly review goal must be a whole number between 1 and 10000.']
	];
	for (const [change, error] of attempts) {
		const result = await saveSettings(programId, orgAdmin, formOf({ ...everySetting, ...change }));
		expect(result).toEqual({ ok: false, status: 400, error });
	}
	expect((await programRow()).name).toBe(`${prefix} renamed`);
	expect(await settingsEvents()).toHaveLength(before.length);
});

test('every action and the page refuse anyone without MANAGE_SETTINGS', async () => {
	const eventsBefore = await db.activityEvent.count({ where: { programId } });
	const eventFor = (user: App.SessionUser | null) =>
		({
			params: { program: programId },
			locals: { user, sessionId: null },
			request: new Request('http://localhost/settings', {
				method: 'POST',
				body: formOf({ ...everySetting, displayName: 'Taken over' })
			}),
			url: new URL('http://localhost/settings'),
			parent: async () => ({ programId })
		}) as never;

	expect(Object.keys(actions).sort()).toEqual([
		'archive',
		'revealOutboundSecret',
		'revealSecret',
		'rollOutboundSecret',
		'rollSecret',
		'save',
		'saveTools',
		'test',
		'testOutbound',
		'unarchive',
		'uploadImage'
	]);
	for (const user of [member, outsider]) {
		for (const action of Object.values(actions)) {
			await expect(action(eventFor(user))).rejects.toMatchObject({ status: 403 });
		}
		await expect(load(eventFor(user))).rejects.toMatchObject({ status: 403 });
	}
	for (const action of Object.values(actions)) {
		await expect(action(eventFor(null))).rejects.toMatchObject({ status: 303, location: '/login' });
	}
	await expect(
		actions.archive({
			...(eventFor(orgAdmin) as object),
			params: { program: `${prefix}Missing` }
		} as never)
	).rejects.toMatchObject({ status: 404 });

	expect((await programRow()).name).toBe(`${prefix} renamed`);
	expect((await programRow()).status).toBe('ACTIVE');
	expect(await db.activityEvent.count({ where: { programId } })).toBe(eventsBefore);
});
