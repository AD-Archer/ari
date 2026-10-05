import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { decideShip } from './decide';
import { requeueShip, revertShip } from './overrides';
import { decisionForm, formOf, reviewFixtures, thrownStatus } from './reviewTestFixtures';

const fixtures = reviewFixtures('overrideTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;
let overrider: App.SessionUser;

const statusOf = async (id: string) =>
	(await db.submission.findUniqueOrThrow({ where: { id } })).status;

async function decidedShip(label: string, options: { externalId?: string } = {}) {
	const ship = await fixtures.ship(label, options);
	const decided = await decideShip('approved', reviewer, programId, ship.id, decisionForm());
	expect(decided.ok).toBe(true);
	return ship;
}

beforeAll(async () => {
	await fixtures.setup();
	reviewer = await fixtures.user('Reviewer');
	overrider = await fixtures.user('Overrider', { permissions: ['OVERRIDE_DECISIONS'] });
});

afterAll(fixtures.cleanup);

describe('revert', () => {
	test('needs OVERRIDE_DECISIONS', async () => {
		const ship = await decidedShip('RevertGate');
		const form = formOf({ public: 'Sorry', audit: 'Wrong hours' });
		expect(await thrownStatus(() => revertShip(reviewer, programId, ship.id, form))).toBe(403);
		expect(await thrownStatus(() => requeueShip(reviewer, programId, ship.id, form))).toBe(403);
		expect(await statusOf(ship.id)).toBe('approved');
	});

	test('unships a decided ship and tells the program why', async () => {
		const ship = await decidedShip('Revert');
		const result = await revertShip(
			overrider,
			programId,
			ship.id,
			formOf({ public: 'We had to undo this.', audit: ' Duplicate project ' })
		);
		expect(result).toEqual({ ok: true, data: { success: true, webhook: 'queued' } });
		expect(await statusOf(ship.id)).toBe('reverted');
		const event = (await fixtures.events(ship.id))[1];
		expect(event.kind).toBe('REVERT');
		expect(event.text).toBe('Unshipped Revert ship: Duplicate project');
		expect(event.meta).toMatchObject({
			fromStatus: 'approved',
			toStatus: 'reverted',
			auditReason: 'Duplicate project',
			hasPublicMessage: true
		});
		const delivery = (await fixtures.deliveries(ship.id))[1];
		expect(delivery.event).toBe('review.reverted');

		// reverted is terminal
		const again = await revertShip(
			overrider,
			programId,
			ship.id,
			formOf({ public: 'Again', audit: 'Again' })
		);
		expect(again).toMatchObject({ ok: false, status: 400, failure: { code: 'notDecided' } });
	});

	test('needs both texts and a decided ship', async () => {
		const pending = await fixtures.ship('RevertPending');
		const ship = await decidedShip('RevertTexts');
		expect(
			await revertShip(overrider, programId, ship.id, formOf({ public: ' ', audit: 'Why' }))
		).toMatchObject({ ok: false, status: 400, failure: { code: 'publicNoteRequired' } });
		expect(
			await revertShip(overrider, programId, ship.id, formOf({ public: 'Sorry', audit: '' }))
		).toMatchObject({ ok: false, status: 400, failure: { code: 'auditReasonRequired' } });
		expect(
			await revertShip(overrider, programId, pending.id, formOf({ public: 'Sorry', audit: 'Why' }))
		).toMatchObject({ ok: false, status: 400, failure: { code: 'notDecided' } });
		expect(await statusOf(ship.id)).toBe('approved');
		expect(await statusOf(pending.id)).toBe('pending');
	});
});

describe('requeue', () => {
	test('sends a decided ship back through processing and tells the program', async () => {
		const ship = await decidedShip('Requeue');
		const missing = await requeueShip(overrider, programId, ship.id, formOf({ audit: ' ' }));
		expect(missing).toMatchObject({
			ok: false,
			status: 400,
			failure: { code: 'auditReasonRequired' }
		});

		const result = await requeueShip(
			overrider,
			programId,
			ship.id,
			formOf({ audit: 'Hours wrong' })
		);
		expect(result).toEqual({ ok: true, data: { success: true, webhook: 'queued' } });
		expect(await statusOf(ship.id)).toBe('processing');
		const event = (await fixtures.events(ship.id))[1];
		expect(event.kind).toBe('REVERT');
		expect(event.text).toBe('Returned Requeue ship to the queue: Hours wrong');
		expect(event.meta).toMatchObject({
			op: 'requeued',
			fromStatus: 'approved',
			toStatus: 'processing'
		});
		const delivery = (await fixtures.deliveries(ship.id))[1];
		expect(delivery.event).toBe('review.requeued');
		// the withdrawn decision stays in the project history
		expect(await db.review.count({ where: { submissionId: ship.id } })).toBe(1);

		const again = await requeueShip(overrider, programId, ship.id, formOf({ audit: 'Again' }));
		expect(again).toMatchObject({ ok: false, status: 400, failure: { code: 'notDecided' } });
	});

	test('is refused while a newer ship of the project is open', async () => {
		const ship = await decidedShip('RequeueOld', { externalId: 'sharedProject' });
		await fixtures.ship('RequeueNew', { externalId: 'sharedProject' });
		const result = await requeueShip(
			overrider,
			programId,
			ship.id,
			formOf({ audit: 'Hours wrong' })
		);
		expect(result).toMatchObject({ ok: false, status: 409, failure: { code: 'newerShipOpen' } });
		expect(await statusOf(ship.id)).toBe('approved');
		expect(await fixtures.deliveries(ship.id)).toHaveLength(1);
	});
});
