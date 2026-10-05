import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { claimSubmission } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { decideShip } from './decide';
import { decisionForm, longAudit, reviewFixtures } from './reviewTestFixtures';

const fixtures = reviewFixtures('decideTest');
const { programId } = fixtures;
let reviewer: App.SessionUser;

const shipRow = (id: string) => db.submission.findUniqueOrThrow({ where: { id } });
const reviewsOf = (submissionId: string) => db.review.findMany({ where: { submissionId } });

beforeAll(async () => {
	await fixtures.setup();
	reviewer = await fixtures.user('Reviewer');
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

describe('a decision that lands', () => {
	test('approving a solo ship settles the posted reductions to exact seconds', async () => {
		const ship = await fixtures.ship('Solo');
		await claimSubmission(ship.id, reviewer.id);
		await db.draft.create({
			data: {
				submissionId: ship.id,
				reviewerId: reviewer.id,
				note: 'draft',
				audit: '',
				fieldValues: {},
				checks: []
			}
		});

		const result = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm({
				...ticked,
				adjustments: { devlogs: { [ship.devlogId]: 1000 } },
				deflateSeconds: 458,
				// a client total is never read
				approvedSeconds: 1
			})
		);
		expect(result).toEqual({
			ok: true,
			data: {
				success: true,
				decision: 'approved',
				outcome: 'final',
				approvedSeconds: 6000, // 6458 settled - 458 deflate
				webhook: 'queued'
			}
		});

		const decided = await shipRow(ship.id);
		expect(decided.status).toBe('approved');
		expect(decided.claimedById).toBeNull();
		expect(decided.claimedAt).toBeNull();

		const [review] = await reviewsOf(ship.id);
		expect(review).toMatchObject({
			reviewerId: reviewer.id,
			decision: 'approved',
			settlementVersion: 3,
			// 5429 tracked + 1000 journal + 29 clip
			approvedSeconds: 6458,
			deflateSeconds: 458,
			collaboratorDeflatesSeconds: null,
			// legacy columns: floor((6458 + 30) / 60) and floor((458 + 30) / 60)
			approvedMinutes: 108,
			deflateMinutes: 8,
			adjustments: {},
			noteToMaker: 'Nice work.',
			auditNote: longAudit,
			checklist: [true, true],
			fixChecks: []
		});
		expect(review.adjustmentsSeconds).toMatchObject({ devlogs: { [ship.devlogId]: 1000 } });

		const [event] = await fixtures.events(ship.id);
		expect(event.kind).toBe('APPROVED');
		expect(event.actorId).toBe(reviewer.id);
		expect(event.text).toBe('Approved Solo ship');
		expect(event.meta).toMatchObject({
			decision: 'approved',
			approvedSeconds: 6458,
			breakdownSeconds: { hackatime: 5429, journals: 1000, lapse: 29, program: 0 },
			approvedMinutes: 108,
			hasNote: true,
			hasAudit: true
		});

		const [delivery] = await fixtures.deliveries(ship.id);
		expect(delivery.event).toBe('review.approved');
		expect(delivery.payload.review.approved_seconds).toBe(6000);
		expect(delivery.payload.review.approved_minutes).toBe(100); // 6000 / 60

		expect(await db.draft.count({ where: { submissionId: ship.id } })).toBe(0);
		const session = await db.submissionOpen.findFirstOrThrow({ where: { submissionId: ship.id } });
		expect(session.closeReason).toBe('decided');
		expect(session.closedAt).not.toBeNull();
	});

	test('a hardware approval needs no hours reasoning and records none of the earlier inputs', async () => {
		const ship = await fixtures.ship('Hardware', { track: 'hardware' });
		await db.program.update({ where: { id: programId }, data: { hoursJustification: true } });
		const form = decisionForm({
			checks: [true],
			technicalFeatures: 'technical features 1.',
			fieldValues: { buildQuality: 'Working' }
		});
		// a client that still posts them is ignored
		form.set('timeEvidence', 'time evidence 1.');
		form.set('hoursReasoning', 'hours reasoning 1.');
		const result = await decideShip('approved', reviewer, programId, ship.id, form);
		await db.program.update({ where: { id: programId }, data: { hoursJustification: false } });

		expect(result).toMatchObject({ ok: true, data: { outcome: 'final', webhook: 'queued' } });
		const [review] = await reviewsOf(ship.id);
		expect(review).toMatchObject({
			technicalFeatures: 'technical features 1.',
			timeEvidence: '',
			supportingEvidence: '',
			hoursReasoning: '',
			additionalJustification: ''
		});
		const [delivery] = await fixtures.deliveries(ship.id);
		const justification = delivery.payload.review.justification as Record<string, string>;
		expect(justification.technical_features).toBe('technical features 1.');
		for (const key of [
			'time_evidence',
			'supporting_evidence',
			'hours_reasoning',
			'additional_justification',
			'unified_db_record'
		])
			expect(key in justification).toBe(false);
	});

	test('approving a collaborative ship applies a per-person deflate', async () => {
		const ship = await fixtures.ship('Pair', { collaborative: true });
		const result = await decideShip(
			'approved',
			reviewer,
			programId,
			ship.id,
			decisionForm({
				...ticked,
				deflateSeconds: 50,
				collaboratorDeflates: { [ship.secondMaker]: 400, stranger: 90 },
				collaboratorNotes: { [ship.secondMaker]: ' Less time than tracked. ', stranger: 'x' }
			})
		);
		expect(result.ok && result.data.approvedSeconds).toBe(3200); // 3600 - 400

		const [review] = await reviewsOf(ship.id);
		expect(review).toMatchObject({
			approvedSeconds: 3600, // 2000 + 1000 tracked + 600 journal
			// the per-person sum replaces the flat cut
			deflateSeconds: 400,
			collaboratorDeflatesSeconds: { [ship.secondMaker]: 400 },
			collaboratorNotes: { [ship.secondMaker]: 'Less time than tracked.' }
		});
		expect(review.collaboratorSeconds).toMatchObject({
			[ship.firstMaker]: { total: 2600, hackatime: 2000, journals: 600 },
			[ship.secondMaker]: { total: 1000, hackatime: 1000 }
		});

		const [delivery] = await fixtures.deliveries(ship.id);
		expect(delivery.payload.review.approved_seconds).toBe(3200);
		const people = delivery.payload.collaborators ?? [];
		expect(people.map((person) => person.approved_seconds).sort()).toEqual([2600, 600]); // 600: 1000 - 400. sorted as strings
		const [event] = await fixtures.events(ship.id);
		expect((event.meta as { collaborators: string[] }).collaborators).toHaveLength(2);
	});

	test('requesting changes and rejecting need neither checklist nor a long audit note', async () => {
		for (const [decision, kind, eventName] of [
			['changes', 'CHANGES', 'review.changes'],
			['rejected', 'REJECTED', 'review.rejected']
		] as const) {
			const ship = await fixtures.ship(`Plain${kind}`);
			const result = await decideShip(
				decision,
				reviewer,
				programId,
				ship.id,
				decisionForm({ audit: 'Short reason.' })
			);
			expect(result.ok && result.data.outcome).toBe('final');
			expect((await shipRow(ship.id)).status).toBe(decision);
			const [review] = await reviewsOf(ship.id);
			expect(review.decision).toBe(decision);
			expect(review.approvedSeconds).toBe(7288); // 5429 + 1830 + 29, what the fixture captures
			expect((await fixtures.events(ship.id))[0].kind).toBe(kind);
			expect((await fixtures.deliveries(ship.id))[0].event).toBe(eventName);
		}
	});
});
