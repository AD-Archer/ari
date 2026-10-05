import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { claimSubmission } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { grantReauth } from '$lib/server/reauth';
import { decideShip } from './decide';
import { decisionForm, reviewFixtures, thrownStatus } from './reviewTestFixtures';

const fixtures = reviewFixtures('decideRefusalsTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;
let colleague: App.SessionUser;
let outsider: App.SessionUser;
let hardwareOnly: App.SessionUser;

const shipRow = (id: string) => db.submission.findUniqueOrThrow({ where: { id } });
const reviewsOf = (submissionId: string) => db.review.findMany({ where: { submissionId } });

async function expectUntouched(shipId: string, status = 'pending') {
	expect((await shipRow(shipId)).status).toBe(status as never);
	expect(await reviewsOf(shipId)).toEqual([]);
	expect(await fixtures.deliveries(shipId)).toEqual([]);
}

beforeAll(async () => {
	await fixtures.setup();
	reviewer = await fixtures.user('Reviewer');
	colleague = await fixtures.user('Colleague');
	outsider = await fixtures.user('Outsider', { member: false });
	hardwareOnly = await fixtures.user('Hardware', { tracks: ['hardware'] });
	await db.checklistItem.createMany({
		data: [
			{ programId, order: 0, label: 'Repository is public', tracks: ['software'] },
			{ programId, order: 1, label: 'Demo works', tracks: ['software'] },
			{ programId, order: 0, label: 'Photos included', tracks: ['hardware'] }
		]
	});
	await db.reviewField.create({
		data: {
			programId,
			type: 'select',
			label: 'Build quality',
			key: 'buildQuality',
			options: ['Working', 'Polished'],
			required: true,
			tracks: ['hardware']
		}
	});
});

afterAll(fixtures.cleanup);

const ticked = { checks: [true, true] };

describe('a decision that is refused', () => {
	test('no access to the program', async () => {
		const ship = await fixtures.ship('NoAccess');
		expect(
			await thrownStatus(() =>
				decideShip('approved', outsider, programId, ship.id, decisionForm(ticked))
			)
		).toBe(403);
		await expectUntouched(ship.id);
	});

	test('a ship outside the reviewer track', async () => {
		const ship = await fixtures.ship('WrongTrack');
		expect(
			await thrownStatus(() =>
				decideShip('approved', hardwareOnly, programId, ship.id, decisionForm(ticked))
			)
		).toBe(403);
		await expectUntouched(ship.id);
	});

	test('a missing ship, or one of another program', async () => {
		expect(
			await thrownStatus(() =>
				decideShip('approved', reviewer, programId, 'seedShipWeather', decisionForm(ticked))
			)
		).toBe(404);
	});

	test('your own project, when the program excludes it', async () => {
		const ship = await fixtures.ship('Own', { makerEmail: reviewer.email.toUpperCase() });
		await db.program.update({
			where: { id: programId },
			data: { reviewersCannotReviewOwnProjects: true }
		});
		const result = await decideShip('approved', reviewer, programId, ship.id, decisionForm(ticked));
		await db.program.update({
			where: { id: programId },
			data: { reviewersCannotReviewOwnProjects: false }
		});
		expect(result).toMatchObject({ ok: false, status: 403, failure: { code: 'selfReview' } });
		await expectUntouched(ship.id);
	});

	test('a ship another reviewer holds a live claim on', async () => {
		const ship = await fixtures.ship('Claimed');
		await claimSubmission(ship.id, colleague.id);
		const result = await decideShip('approved', reviewer, programId, ship.id, decisionForm(ticked));
		expect(result).toMatchObject({
			ok: false,
			status: 409,
			failure: { code: 'claimHeldByOther', locked: true }
		});
		await expectUntouched(ship.id);
		expect((await shipRow(ship.id)).claimedById).toBe(colleague.id);

		// a claim past its ttl no longer blocks
		await db.submission.update({
			where: { id: ship.id },
			data: { claimedAt: new Date(Date.now() - 3600000) } // 1 h ago: 60 * 60 * 1000
		});
		const retried = await decideShip('rejected', reviewer, programId, ship.id, decisionForm());
		expect(retried.ok).toBe(true);
	});

	test('a ship that is not pending', async () => {
		for (const status of ['approved', 'secondpass', 'fraudreview', 'withdrawn'] as const) {
			const ship = await fixtures.ship(`Closed${status}`, { status });
			const result = await decideShip(
				'approved',
				reviewer,
				programId,
				ship.id,
				decisionForm(ticked)
			);
			expect(result).toMatchObject({ ok: false, status: 409, failure: { code: 'shipClosed' } });
			await expectUntouched(ship.id, status);
		}
	});

	test('an ingest version older than the ship', async () => {
		const ship = await fixtures.ship('Stale');
		await db.submission.update({ where: { id: ship.id }, data: { ingestVersion: 3 } });
		const result = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm(ticked, 2)
		);
		expect(result).toMatchObject({ ok: false, status: 409, failure: { code: 'staleIngest' } });
		await expectUntouched(ship.id);
		const current = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm(ticked, 3)
		);
		expect(current.ok).toBe(true);
	});

	test('rule problems, with exactly the problems the shared rules name', async () => {
		const software = await fixtures.ship('Rules');
		const hardware = await fixtures.ship('RulesHardware', { track: 'hardware' });
		await db.program.update({ where: { id: programId }, data: { hoursJustification: true } });
		const attempts = [
			[software.id, { ...ticked, audit: ' ', technicalFeatures: 'Parser.' }, 'auditRequired'],
			[
				software.id,
				{ ...ticked, audit: 'Too short.', technicalFeatures: 'Parser.' },
				'auditTooShort'
			],
			[software.id, { checks: [true, false], technicalFeatures: 'Parser.' }, 'checklistIncomplete'],
			[software.id, { ...ticked }, 'technicalFeaturesRequired'],
			[
				software.id,
				{ ...ticked, technicalFeatures: 'Parser.', deflateSeconds: 60 },
				'deflationReasonRequired'
			],
			[
				software.id,
				{
					...ticked,
					technicalFeatures: 'Parser.',
					adjustments: { devlogs: { [software.devlogId]: 10 } }
				},
				'deflationReasonRequired'
			],
			[hardware.id, { checks: [true], technicalFeatures: 'PCB.' }, 'fieldRequired']
		] as const;
		for (const [shipId, fields, code] of attempts) {
			const result = await decideShip(
				'approved',
				reviewer,
				programId,
				shipId,
				decisionForm(fields)
			);
			expect(result).toMatchObject({ ok: false, status: 400, failure: { code } });
			if (!result.ok) {
				expect(result.failure.problems?.[0].code).toBe(code);
				expect(result.failure.error).toBe(result.failure.problems![0].message);
			}
			await expectUntouched(shipId);
		}
		// a required field does not gate sending the ship back
		const changes = await decideShip('changes', reviewer, programId, hardware.id, decisionForm());
		await db.program.update({ where: { id: programId }, data: { hoursJustification: false } });
		expect(changes.ok).toBe(true);
	});

	test('a re-ship whose requested changes were not confirmed', async () => {
		const prior = await fixtures.ship('FixPrior', { status: 'changes', externalId: 'fixProject' });
		const priorReview = await db.review.create({
			data: {
				submissionId: prior.id,
				reviewerId: colleague.id,
				decision: 'changes',
				noteToMaker: 'Fix the demo.',
				auditNote: 'Demo down.',
				fieldValues: {},
				checklist: []
			}
		});
		const ship = await fixtures.ship('FixNext', { externalId: 'fixProject', version: 2 });
		const refused = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm(ticked)
		);
		expect(refused).toMatchObject({
			ok: false,
			status: 400,
			failure: { code: 'fixesUnconfirmed' }
		});
		const approved = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm({ ...ticked, fixChecks: [priorReview.id, 'noise'] })
		);
		expect(approved.ok).toBe(true);
		expect((await reviewsOf(ship.id))[0].fixChecks).toEqual([priorReview.id]);
	});

	test('reauth required and not fresh', async () => {
		const ship = await fixtures.ship('Reauth');
		await db.program.update({ where: { id: programId }, data: { reviewerReauth: true } });
		const refused = await decideShip('rejected', reviewer, programId, ship.id, decisionForm());
		expect(refused).toMatchObject({
			ok: false,
			status: 401,
			failure: { code: 'reauthRequired', reauth: true }
		});
		if (!refused.ok) expect(refused.failure.url).toContain('/auth/login?reauth=1');
		await expectUntouched(ship.id);

		await grantReauth(reviewer.id, programId);
		const allowed = await decideShip('rejected', reviewer, programId, ship.id, decisionForm());
		await db.program.update({ where: { id: programId }, data: { reviewerReauth: false } });
		expect(allowed.ok).toBe(true);
	});

	test('with deflation off, posted cuts are ignored rather than refused', async () => {
		const ship = await fixtures.ship('NoDeflation');
		await db.program.update({ where: { id: programId }, data: { allowDeflation: false } });
		const result = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm({
				...ticked,
				adjustments: { devlogs: { [ship.devlogId]: 0 } },
				deflateSeconds: 900
			})
		);
		await db.program.update({ where: { id: programId }, data: { allowDeflation: true } });
		expect(result.ok && result.data.approvedSeconds).toBe(7288);
		expect((await reviewsOf(ship.id))[0]).toMatchObject({
			approvedSeconds: 7288,
			deflateSeconds: null
		});
	});
});
