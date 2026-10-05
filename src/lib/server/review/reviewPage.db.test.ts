import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { claimSubmission } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { actions } from '../../../routes/p/[program]/review/[id]/+page.server';
import { POST as postDraft } from '../../../routes/p/[program]/review/[id]/draft/+server';
import { claimShip, takeoverShip } from './claimActions';
import { decideShip } from './decide';
import { draftFromRow } from './draft';
import { loadReviewPage } from './load';
import { shipMakers } from './makers';
import { decisionForm, formOf, reviewFixtures, thrownStatus } from './reviewTestFixtures';
import { editShip } from './shipEdit';
import { shipTimeline } from './timeline';

const fixtures = reviewFixtures('reviewPageTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;
let colleague: App.SessionUser;
let overrider: App.SessionUser;
let outsider: App.SessionUser;
let hardwareOnly: App.SessionUser;

const meta = {
	color: '#338eda',
	excludeOwnProjects: false,
	reauthRequired: false,
	reauthTtlMinutes: 60,
	reviewGoal: 10,
	allowVms: false,
	allowDeflation: true,
	hoursJustification: false
};
const pageFor = (user: App.SessionUser, submissionId: string) =>
	loadReviewPage({
		user,
		programId,
		submissionId,
		url: new URL(`http://localhost/p/${programId}/review/${submissionId}`),
		meta
	});

const editForm = (
	ship: { firstMaker: string },
	email: string,
	fields: Record<string, string> = {}
) =>
	formOf({
		title: 'Edit ship',
		track: 'software',
		description: 'A ship for a test.',
		repoUrl: 'https://github.com/maker/ship',
		demoUrl: 'https://example.com/demo',
		thumbnailUrl: '',
		hackatimeProjects: JSON.stringify(['ship']),
		authorNames: JSON.stringify({ [email]: 'EditOne' }),
		...fields
	});

beforeAll(async () => {
	await fixtures.setup();
	reviewer = await fixtures.user('Reviewer');
	colleague = await fixtures.user('Colleague');
	overrider = await fixtures.user('Overrider', { permissions: ['OVERRIDE_DECISIONS'] });
	outsider = await fixtures.user('Outsider', { member: false });
	hardwareOnly = await fixtures.user('Hardware', { tracks: ['hardware'] });
});

afterAll(fixtures.cleanup);

describe('route actions', () => {
	test('a signed-out post is sent to the login page before anything runs', async () => {
		const ship = await fixtures.ship('SignedOut');
		const event = {
			params: { program: programId, id: ship.id },
			locals: { user: null, sessionId: null },
			request: new Request('http://localhost/', { method: 'POST', body: decisionForm() })
		};
		for (const name of [
			'approve',
			'changes',
			'reject',
			'claim',
			'takeover',
			'editShip',
			'uploadImage',
			'dismiss',
			'revert',
			'requeue',
			'launchVm',
			'stopVm',
			'resync',
			'confirmSecondPass',
			'returnSecondPass'
		] as const) {
			let thrown: { status?: number; location?: string } = {};
			try {
				await actions[name](event as never);
			} catch (caught) {
				thrown = caught as typeof thrown;
			}
			expect([name, thrown.status, thrown.location]).toEqual([name, 303, '/login']);
		}
		expect(await actions.heartbeat(event as never)).toEqual({ ok: false, lost: true });
		expect(await actions.release(event as never)).toEqual({ ok: true });
		expect((await db.submission.findUniqueOrThrow({ where: { id: ship.id } })).status).toBe(
			'pending'
		);
	});
});

describe('claims', () => {
	test('claim, a locked claim, and a takeover that needs OVERRIDE_DECISIONS', async () => {
		const ship = await fixtures.ship('Claim');
		expect(await claimShip(reviewer, programId, ship.id)).toEqual({ ok: true, data: { ok: true } });
		expect(await claimShip(colleague, programId, ship.id)).toMatchObject({
			ok: false,
			status: 409,
			failure: { code: 'claimHeldByOther', locked: true, by: 'Reviewer' }
		});
		expect(await thrownStatus(() => takeoverShip(colleague, programId, ship.id))).toBe(403);
		expect(await thrownStatus(() => claimShip(outsider, programId, ship.id))).toBe(403);
		expect(await thrownStatus(() => claimShip(hardwareOnly, programId, ship.id))).toBe(403);
		expect((await takeoverShip(overrider, programId, ship.id)).ok).toBe(true);
		expect((await db.submission.findUniqueOrThrow({ where: { id: ship.id } })).claimedById).toBe(
			overrider.id
		);

		const viewed = await pageFor(reviewer, ship.id);
		expect(viewed.lock).toEqual({
			claimable: true,
			mine: false,
			readOnly: true,
			byName: 'Overrider'
		});
	});

	test('a program that requires reauth refuses the claim until it is fresh', async () => {
		const ship = await fixtures.ship('ClaimReauth');
		await db.program.update({ where: { id: programId }, data: { reviewerReauth: true } });
		const refused = await claimShip(colleague, programId, ship.id);
		await db.program.update({ where: { id: programId }, data: { reviewerReauth: false } });
		expect(refused).toMatchObject({ ok: false, status: 401, failure: { reauth: true } });
	});
});

describe('editShip', () => {
	test('validates, records the change and queues ship.updated', async () => {
		const ship = await fixtures.ship('Edit');
		const email = `${ship.firstMaker.toLowerCase()}@example.com`;
		const refusals = [
			[{ title: ' ' }, 'Ship title is required.'],
			[{ title: 'x'.repeat(201) }, 'Ship title must be 200 characters or less.'],
			[{ description: '' }, 'Ship description is required.'],
			[{ repoUrl: 'ftp://example.com/repo' }, 'Repository URL must use http or https.'],
			[{ repoUrl: '' }, 'Repository URL is required.'],
			[{ demoUrl: '' }, 'Live demo URL is required.'],
			[{ thumbnailUrl: 'not a url' }, 'Thumbnail URL must be a valid URL.'],
			[{ track: 'boat' }, 'Ship type must be software or hardware.'],
			[{ hackatimeProjects: '{' }, 'The edit form contained malformed project or author data.'],
			[{ authorNames: '{}' }, `An author name is required for ${email}.`]
		] as const;
		for (const [fields, message] of refusals) {
			const result = await editShip(reviewer, programId, ship.id, editForm(ship, email, fields));
			expect(result).toMatchObject({ ok: false, status: 400, failure: { error: message } });
		}
		expect(
			await editShip(reviewer, programId, ship.id, editForm(ship, email, { track: 'hardware' }))
		).toMatchObject({ ok: false, status: 403, failure: { code: 'trackPermission' } });
		expect(await fixtures.deliveries(ship.id)).toEqual([]);

		expect(await editShip(reviewer, programId, ship.id, editForm(ship, email))).toEqual({
			ok: true,
			data: { success: true, unchanged: true }
		});

		const result = await editShip(
			reviewer,
			programId,
			ship.id,
			editForm(ship, email, { title: 'Renamed ship', thumbnailUrl: 'https://example.com/a.png' })
		);
		expect(result).toMatchObject({
			ok: true,
			data: { success: true, changed: 2, webhook: 'queued', resyncQueued: false }
		});
		const row = await db.submission.findUniqueOrThrow({ where: { id: ship.id } });
		expect(row.title).toBe('Renamed ship');
		expect(row.thumbnailUrl).toBe('https://example.com/a.png');
		const [event] = await fixtures.events(ship.id);
		expect(event.kind).toBe('SHIP_EDIT');
		expect(
			(event.meta as { changes: { field: string }[] }).changes.map((change) => change.field)
		).toEqual(['title', 'thumbnail_url']);
		const [delivery] = await fixtures.deliveries(ship.id);
		expect(delivery.event).toBe('ship.updated');
		expect(delivery.payload.ship.title).toBe('Renamed ship');
	});

	test('is refused on a ship someone else holds, or one that is decided', async () => {
		const ship = await fixtures.ship('EditLocked');
		const email = `${ship.firstMaker.toLowerCase()}@example.com`;
		await claimSubmission(ship.id, colleague.id);
		const form = () => editForm(ship, email, { title: 'Nope' });
		expect(await editShip(reviewer, programId, ship.id, form())).toMatchObject({
			ok: false,
			status: 409,
			failure: { code: 'claimHeldByOther', locked: true }
		});
		await decideShip('rejected', colleague, programId, ship.id, decisionForm());
		expect(await editShip(colleague, programId, ship.id, form())).toMatchObject({
			ok: false,
			status: 409,
			failure: { error: 'Only a ship waiting for review can be edited.' }
		});
		expect(await thrownStatus(() => editShip(outsider, programId, ship.id, form()))).toBe(403);
	});
});

describe('draft endpoint', () => {
	const post = (user: App.SessionUser | null, submissionId: string, body: unknown) =>
		postDraft({
			request: new Request('http://localhost/', { method: 'POST', body: JSON.stringify(body) }),
			params: { program: programId, id: submissionId },
			locals: { user, sessionId: null }
		} as never);

	test('round-trips a draft in seconds and dual-writes the legacy minutes', async () => {
		const ship = await fixtures.ship('Draft', { collaborative: true });
		const draft = {
			note: 'Draft note',
			audit: 'Draft audit',
			technicalFeatures: 'Features',
			deflationReason: 'Reason',
			adjustments: { devlogs: { [ship.devlogId]: 290 }, hackatime: { [ship.firstMaker]: 1999 } },
			deflateSeconds: 95,
			collaboratorDeflates: { [ship.secondMaker]: 150 },
			collaboratorNotes: { [ship.secondMaker]: 'A note' },
			fieldValues: { level: 'Gold' },
			checks: [true, false],
			fixChecks: ['reviewOne']
		};
		const response = await post(reviewer, ship.id, draft);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });

		const row = await db.draft.findUniqueOrThrow({
			where: { submissionId_reviewerId: { submissionId: ship.id, reviewerId: reviewer.id } }
		});
		expect(row).toMatchObject({
			adjustmentsSeconds: draft.adjustments,
			deflateSeconds: 95,
			collaboratorDeflatesSeconds: draft.collaboratorDeflates,
			// floor((290 + 30) / 60), floor((1999 + 30) / 60), floor((95 + 30) / 60), floor((150 + 30) / 60)
			adjustments: { devlogs: { [ship.devlogId]: 5 }, hackatime: { [ship.firstMaker]: 33 } },
			deflateMinutes: 2,
			collaboratorDeflates: { [ship.secondMaker]: 3 }
		});
		expect(draftFromRow(row)).toEqual(draft);
		expect((await pageFor(reviewer, ship.id)).draft).toEqual(draft);

		// old ari edits only the minute columns: the newer minutes win over the stale seconds
		await db.draft.update({
			where: { submissionId_reviewerId: { submissionId: ship.id, reviewerId: reviewer.id } },
			data: { adjustments: { devlogs: { [ship.devlogId]: 4 } }, deflateMinutes: 7 }
		});
		const reread = draftFromRow(
			await db.draft.findUniqueOrThrow({
				where: { submissionId_reviewerId: { submissionId: ship.id, reviewerId: reviewer.id } }
			})
		);
		expect(reread.adjustments).toEqual({ devlogs: { [ship.devlogId]: 240 } }); // 4 * 60
		expect(reread.deflateSeconds).toBe(420); // 7 * 60
	});

	test('is refused for anyone who may not act on the ship', async () => {
		const ship = await fixtures.ship('DraftGate');
		await claimSubmission(ship.id, colleague.id);
		expect((await post(null, ship.id, {})).status).toBe(401);
		expect((await post(outsider, ship.id, {})).status).toBe(403);
		expect((await post(hardwareOnly, ship.id, {})).status).toBe(403);
		expect((await post(reviewer, ship.id, {})).status).toBe(409);
		expect((await post(reviewer, 'seedShipWeather', {})).status).toBe(404);
		expect(await db.draft.count({ where: { submissionId: ship.id } })).toBe(0);
	});
});

describe('timeline and maker endpoints', () => {
	test('the timeline tells the ship history oldest first', async () => {
		const ship = await fixtures.ship('Timeline');
		const email = `${ship.firstMaker.toLowerCase()}@example.com`;
		await claimShip(reviewer, programId, ship.id);
		await editShip(
			reviewer,
			programId,
			ship.id,
			editForm(ship, email, {
				title: 'Timeline two',
				authorNames: JSON.stringify({ [email]: 'TimelineOne' })
			})
		);
		await decideShip('approved', reviewer, programId, ship.id, decisionForm());

		const items = await shipTimeline(reviewer, programId, ship.id);
		expect(items.map((item) => item.kind)).toEqual(['submitted', 'opened', 'edit', 'approved']);
		expect(items[0]).toMatchObject({ id: 'submitted', detail: 'Ship submitted' });
		expect(items[0].who?.name).toBe('TimelineOne');
		expect(items[1]).toMatchObject({ detail: 'Opened for review', who: { name: 'Reviewer' } });
		expect(items[2]).toMatchObject({
			detail: 'Edited ship · 1 field',
			changes: [{ label: 'Title', from: 'Timeline ship', to: 'Timeline two' }]
		});
		// 7288 s is 2.02 h
		expect(items[3].detail).toBe('Approved · 2h');
		for (const item of items) {
			expect(
				Object.keys(item)
					.filter((key) => key !== 'changes')
					.sort()
			).toEqual(['ago', 'detail', 'id', 'iso', 'kind', 'whenLabel', 'who']);
			expect(new Date(item.iso).toISOString()).toBe(item.iso);
		}
	});

	test('both endpoints repeat the gates of the page', async () => {
		const ship = await fixtures.ship('Gate');
		const held = await fixtures.ship('GateHeld', { status: 'secondpass' });
		const parked = await fixtures.ship('GateParked', { status: 'fraudreview' });
		for (const read of [shipMakers, shipTimeline, pageOf]) {
			if (read !== pageOf)
				expect(await thrownStatus(() => read(outsider, programId, ship.id))).toBe(403);
			expect(await thrownStatus(() => read(hardwareOnly, programId, ship.id))).toBe(403);
			expect(await thrownStatus(() => read(reviewer, programId, held.id))).toBe(403);
			expect(await thrownStatus(() => read(overrider, programId, parked.id))).toBe(403);
			expect(await thrownStatus(() => read(reviewer, programId, 'seedShipWeather'))).toBe(404);
		}
		expect(await thrownStatus(() => shipMakers(null, programId, ship.id))).toBe(401);
		expect(await thrownStatus(() => shipTimeline(null, programId, ship.id))).toBe(401);

		const makers = await shipMakers(reviewer, programId, ship.id);
		expect(makers).toEqual([
			{
				name: 'GateOne',
				email: `${ship.firstMaker.toLowerCase()}@example.com`,
				slackId: null,
				hackatimeUserId: null,
				slackUsername: null,
				slackDisplayName: null
			}
		]);
	});
});

// membership is the layout's gate for the page, so the outsider case is the endpoints' alone
const pageOf = (user: App.SessionUser, _programId: string, submissionId: string) =>
	pageFor(user, submissionId);
