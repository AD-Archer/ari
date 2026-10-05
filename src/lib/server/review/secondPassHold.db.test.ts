import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { decideShip } from './decide';
import { draftFromRow } from './draft';
import { decisionForm, formOf, reviewFixtures } from './reviewTestFixtures';
import { returnSecondPass } from './secondPassReturn';

const fixtures = reviewFixtures('secondPassHoldTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;
let lead: App.SessionUser;
let organizer: App.SessionUser;

const shipRow = (id: string) => db.submission.findUniqueOrThrow({ where: { id } });
const reviewOf = (submissionId: string) => db.review.findFirstOrThrow({ where: { submissionId } });
const setProgram = (data: Record<string, boolean>) =>
	db.program.update({ where: { id: programId }, data });

async function heldShip(label: string, fields: Record<string, unknown> = {}) {
	const ship = await fixtures.ship(label);
	const held = await decideShip('approved', reviewer, programId, ship.id, decisionForm(fields));
	expect(held.ok && held.data.outcome).toBe('held');
	return ship;
}

beforeAll(async () => {
	await fixtures.setup({ secondPass: true });
	reviewer = await fixtures.user('Reviewer');
	lead = await fixtures.user('Lead', { permissions: ['SECOND_PASS'] });
	organizer = await fixtures.user('Organizer', { isPoc: true });
});

afterAll(fixtures.cleanup);

describe('holding a decision', () => {
	test('a reviewer approval is held: recorded, nothing sent', async () => {
		const ship = await fixtures.ship('Held');
		const result = await decideShip('approved', reviewer, programId, ship.id, decisionForm());
		expect(result).toEqual({
			ok: true,
			data: {
				success: true,
				decision: 'approved',
				outcome: 'held',
				approvedSeconds: 7288, // 5429 + 1830 + 29, what the fixture captures
				webhook: null
			}
		});
		expect((await shipRow(ship.id)).status).toBe('secondpass');
		expect((await reviewOf(ship.id)).decision).toBe('approved');
		expect(await fixtures.deliveries(ship.id)).toEqual([]);
		const [event] = await fixtures.events(ship.id);
		expect(event.text).toBe('Approved Held ship (pending second pass)');
		expect(event.meta).toMatchObject({ secondPass: 'pending' });
	});

	test('a second-pass holder is still held: only the people running the program bypass', async () => {
		const byLead = await fixtures.ship('HeldLead');
		const leadResult = await decideShip('approved', lead, programId, byLead.id, decisionForm());
		expect(leadResult.ok && leadResult.data.outcome).toBe('held');

		const byOrganizer = await fixtures.ship('Bypass');
		const bypassed = await decideShip(
			'approved',
			organizer,
			programId,
			byOrganizer.id,
			decisionForm()
		);
		expect(bypassed.ok && bypassed.data).toMatchObject({ outcome: 'final', webhook: 'queued' });
		expect((await shipRow(byOrganizer.id)).status).toBe('approved');

		await setProgram({ secondPassOrganizerBypass: false });
		const noBypass = await fixtures.ship('NoBypass');
		const held = await decideShip('approved', organizer, programId, noBypass.id, decisionForm());
		await setProgram({ secondPassOrganizerBypass: true });
		expect(held.ok && held.data.outcome).toBe('held');
		expect(await fixtures.deliveries(noBypass.id)).toEqual([]);
	});

	test('each decision kind is held only when its toggle is on', async () => {
		await setProgram({ secondPassChanges: false, secondPassRejected: false });
		const changes = await fixtures.ship('ToggleChanges');
		const rejected = await fixtures.ship('ToggleRejected');
		const approved = await fixtures.ship('ToggleApproved');
		const sent = await decideShip('changes', reviewer, programId, changes.id, decisionForm());
		const turnedDown = await decideShip(
			'rejected',
			reviewer,
			programId,
			rejected.id,
			decisionForm()
		);
		const held = await decideShip('approved', reviewer, programId, approved.id, decisionForm());
		expect(sent.ok && sent.data.outcome).toBe('final');
		expect(turnedDown.ok && turnedDown.data.outcome).toBe('final');
		expect(held.ok && held.data.outcome).toBe('held');

		await setProgram({
			secondPassChanges: true,
			secondPassRejected: true,
			secondPassApproved: false
		});
		const heldChanges = await fixtures.ship('ToggleChangesHeld');
		const direct = await fixtures.ship('ToggleApprovedDirect');
		const back = await decideShip('changes', reviewer, programId, heldChanges.id, decisionForm());
		const through = await decideShip('approved', reviewer, programId, direct.id, decisionForm());
		await setProgram({ secondPassApproved: true });
		expect(back.ok && back.data.outcome).toBe('held');
		expect((await shipRow(heldChanges.id)).status).toBe('secondpass');
		expect(through.ok && through.data.outcome).toBe('final');
	});
});

describe('returning a held decision', () => {
	test('the ship reopens with the reviewer draft restored, and nothing is sent', async () => {
		const ship = await heldShip('Return', {
			adjustments: { devlogs: { placeholder: 1 } },
			deflateSeconds: 300
		});
		const missing = await returnSecondPass(lead, programId, ship.id, formOf({ reason: ' ' }));
		expect(missing).toMatchObject({ ok: false, status: 400, failure: { code: 'reasonRequired' } });

		const result = await returnSecondPass(
			lead,
			programId,
			ship.id,
			formOf({ reason: 'Hours look off', takeover: '1' })
		);
		expect(result).toEqual({ ok: true, data: { success: true, takeover: true } });
		expect((await shipRow(ship.id)).status).toBe('pending');
		expect(await fixtures.deliveries(ship.id)).toEqual([]);

		const drafts = await db.draft.findMany({ where: { submissionId: ship.id } });
		expect(drafts.map((draft) => draft.reviewerId).sort()).toEqual([lead.id, reviewer.id].sort());
		expect(draftFromRow(drafts[0])).toMatchObject({ note: 'Nice work.', deflateSeconds: 300 });
		expect(drafts[0].deflateMinutes).toBe(5); // 300 / 60

		const event = (await fixtures.events(ship.id))[1];
		expect(event.kind).toBe('REVERT');
		expect(event.meta).toMatchObject({
			op: 'second-pass-returned',
			fromStatus: 'secondpass',
			toStatus: 'pending',
			auditReason: 'Hours look off',
			takeover: true
		});

		const again = await returnSecondPass(lead, programId, ship.id, formOf({ reason: 'Again' }));
		expect(again).toMatchObject({
			ok: false,
			status: 409,
			failure: { code: 'notAwaitingSecondPass' }
		});
	});
});
