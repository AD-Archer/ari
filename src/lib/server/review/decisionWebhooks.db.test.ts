import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { decideShip } from './decide';
import { decisionForm, reviewFixtures } from './reviewTestFixtures';
import { confirmSecondPass } from './secondPass';

const fixtures = reviewFixtures('decisionWebhooksTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;
let lead: App.SessionUser;

// the old app sends the reviewer's settled time on every decision kind, credited or not:
// integrators read `decision`, the time fields say what the reviewer settled
const settledTime = {
	approved_minutes: 121, // floor((7288 + 30) / 60)
	approved_hours: 2, // 121 / 60 to one decimal
	approved_seconds: 7288, // 5429 + 1830 + 29, what the fixture captures
	minutes_breakdown: { hackatime: 90, journals: 30, lapse: 1, program: 0 },
	seconds_breakdown: { hackatime: 5429, journals: 1830, lapse: 29, program: 0 }
};

// a 1288 s flat deflate over 5429 / 1830 / 29 leaves 6000 s, split by largest remainder
const deflatedTime = {
	approved_minutes: 100, // 6000 / 60
	approved_hours: 1.7, // 100 / 60 to one decimal
	approved_seconds: 6000 // 7288 - 1288
};

const setSecondPass = (secondPass: boolean) =>
	db.program.update({ where: { id: programId }, data: { secondPass } });

async function onlyDelivery(shipId: string) {
	const sent = await fixtures.deliveries(shipId);
	expect(sent).toHaveLength(1);
	return sent[0];
}

beforeAll(async () => {
	await fixtures.setup();
	reviewer = await fixtures.user('Reviewer');
	lead = await fixtures.user('Lead', { permissions: ['SECOND_PASS'] });
});

afterAll(fixtures.cleanup);

describe('time fields on a decision that is not an approval', () => {
	test('a first-pass rejection carries the settled time', async () => {
		const ship = await fixtures.ship('Reject');
		await decideShip('rejected', reviewer, programId, ship.id, decisionForm());
		const delivery = await onlyDelivery(ship.id);
		expect(delivery.event).toBe('review.rejected');
		expect(delivery.payload.decision as unknown).toBe('rejected');
		expect(delivery.payload.review).toMatchObject(settledTime);
	});

	test('a first-pass request for changes carries the settled time', async () => {
		const ship = await fixtures.ship('Changes');
		await decideShip('changes', reviewer, programId, ship.id, decisionForm());
		const delivery = await onlyDelivery(ship.id);
		expect(delivery.event).toBe('review.changes');
		expect(delivery.payload.decision as unknown).toBe('changes');
		expect(delivery.payload.review).toMatchObject(settledTime);
	});

	test('a first-pass rejection reports the time after the reviewer deflate', async () => {
		const ship = await fixtures.ship('RejectDeflated');
		await decideShip(
			'rejected',
			reviewer,
			programId,
			ship.id,
			decisionForm({ deflateSeconds: 1288 })
		);
		const { payload } = await onlyDelivery(ship.id);
		expect(payload.review).toMatchObject(deflatedTime);
		const stored = await db.review.findFirstOrThrow({ where: { submissionId: ship.id } });
		expect(stored.approvedSeconds).toBe(7288);
		expect(stored.deflateSeconds).toBe(1288);
	});

	test('a held approval confirmed as a rejection or as changes carries the held time', async () => {
		await setSecondPass(true);
		for (const [decision, eventName] of [
			['rejected', 'review.rejected'],
			['changes', 'review.changes']
		] as const) {
			const ship = await fixtures.ship(`Held${decision}`);
			const held = await decideShip('approved', reviewer, programId, ship.id, decisionForm());
			expect(held.ok && held.data.outcome).toBe('held');
			expect(await fixtures.deliveries(ship.id)).toEqual([]);

			const form = decisionForm({ note: 'Not this time.' });
			form.set('decision', decision);
			const confirmed = await confirmSecondPass(lead, programId, ship.id, form);
			expect(confirmed.ok && confirmed.data).toMatchObject({
				decision,
				overridden: true,
				approvedSeconds: 7288
			});
			const delivery = await onlyDelivery(ship.id);
			expect(delivery.event).toBe(eventName);
			expect(delivery.payload.decision as unknown).toBe(decision);
			expect(delivery.payload.review).toMatchObject(settledTime);

			const stored = await db.review.findFirstOrThrow({ where: { submissionId: ship.id } });
			expect(stored).toMatchObject({ decision, approvedSeconds: 7288, approvedMinutes: 121 });
		}
		await setSecondPass(false);
	});

	test('a held approval with a deflate confirmed as a rejection reports the deflated time', async () => {
		await setSecondPass(true);
		const ship = await fixtures.ship('HeldDeflated');
		await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm({ deflateSeconds: 1288 })
		);
		const form = decisionForm({ note: 'Not this time.' });
		form.delete('deflateSeconds');
		form.set('decision', 'rejected');
		await confirmSecondPass(lead, programId, ship.id, form);
		const { payload } = await onlyDelivery(ship.id);
		expect(payload.review).toMatchObject(deflatedTime);
		await setSecondPass(false);
	});
});
