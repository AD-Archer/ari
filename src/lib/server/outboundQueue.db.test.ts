import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { encrypt } from '$lib/server/crypto';
import { dispatchShipUpdatedWebhook, redispatchLastReview } from './outbound';
import { buildShipSnapshot } from './outboundPayload';

const prefix = `outboundQueueTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const programId = `${prefix}Program`;
const reviewerId = `${prefix}Reviewer`;
const makerId = `${prefix}Maker`;
const decidedShipId = `${prefix}Decided`;
const pendingShipId = `${prefix}Pending`;
const safeUrl = 'https://hooks.example.test/ari-events';

const deliveries = () =>
	db.outboundDelivery.findMany({
		where: { programId },
		select: { event: true, submissionId: true, url: true, status: true, payload: true }
	});

const queueFailures = () =>
	db.activityEvent.findMany({
		where: { programId, kind: 'DELIVERY' },
		select: { submissionId: true, text: true, meta: true }
	});

const setEndpoint = (data: { url?: string | null; enabled?: boolean; secretEnc?: string | null }) =>
	db.outboundEndpoint.create({
		data: { programId, url: safeUrl, enabled: true, secretEnc: encrypt('signing-secret'), ...data }
	});

beforeAll(async () => {
	await db.user.create({
		data: {
			id: reviewerId,
			email: `${reviewerId}@example.com`,
			name: reviewerId,
			avatarColor: '#338eda'
		}
	});
	await db.program.create({ data: { id: programId, name: prefix, color: '#338eda' } });
	await db.maker.create({ data: { id: makerId, email: `${makerId}@example.com` } });
	await db.submission.createMany({
		data: [
			{ id: decidedShipId, status: 'approved' as const },
			{ id: pendingShipId, status: 'pending' as const }
		].map((ship) => ({
			...ship,
			programId,
			externalId: ship.id,
			makerId,
			title: ship.id,
			repoUrl: 'https://github.com/maker/ship',
			claimedHours: 1
		}))
	});
	await db.review.create({
		data: {
			submissionId: decidedShipId,
			reviewerId,
			decision: 'approved',
			noteToMaker: 'Nice',
			auditNote: 'checked',
			fieldValues: {},
			checklist: {},
			approvedMinutes: 60
		}
	});
});

beforeEach(async () => {
	await db.outboundEndpoint.deleteMany({ where: { programId } });
	await db.outboundDelivery.deleteMany({ where: { programId } });
	await db.activityEvent.deleteMany({ where: { programId } });
});

afterAll(async () => {
	await db.program.deleteMany({ where: { id: programId } });
	await db.maker.deleteMany({ where: { id: { startsWith: prefix } } });
	await db.user.deleteMany({ where: { id: reviewerId } });
});

describe('redispatchLastReview outcome', () => {
	test('no endpoint row: nothing queued, nothing logged', async () => {
		expect(await redispatchLastReview(decidedShipId)).toBe('noEndpoint');
		expect(await deliveries()).toEqual([]);
		expect(await queueFailures()).toEqual([]);
	});

	test('a disabled endpoint counts as no endpoint', async () => {
		await setEndpoint({ enabled: false });
		expect(await redispatchLastReview(decidedShipId)).toBe('noEndpoint');
		expect(await deliveries()).toEqual([]);
	});

	test('an endpoint without a url counts as no endpoint', async () => {
		await setEndpoint({ url: null });
		expect(await redispatchLastReview(decidedShipId)).toBe('noEndpoint');
		expect(await deliveries()).toEqual([]);
	});

	test('no signing secret', async () => {
		await setEndpoint({ secretEnc: null });
		expect(await redispatchLastReview(decidedShipId)).toBe('notSigned');
		expect(await deliveries()).toEqual([]);
		expect(await queueFailures()).toEqual([]);
	});

	test('an unsafe url is refused and leaves a queue-failed event', async () => {
		await setEndpoint({ url: 'http://localhost:9/hook' });
		expect(await redispatchLastReview(decidedShipId)).toBe('blockedUrl');
		expect(await deliveries()).toEqual([]);
		expect(await queueFailures()).toEqual([
			{
				submissionId: decidedShipId,
				text: 'Webhook could not be queued · review.approved',
				meta: {
					event: 'review.approved',
					status: 'QUEUE_FAILED',
					errorDetail: 'destination URL is not allowed'
				}
			}
		]);
	});

	test('a secret that cannot be decrypted fails and is logged', async () => {
		await setEndpoint({ secretEnc: 'not-a-real-ciphertext' });
		expect(await redispatchLastReview(decidedShipId)).toBe('failed');
		expect(await deliveries()).toEqual([]);
		expect(await queueFailures()).toHaveLength(1);
	});

	test('no decision: an undecided or unknown ship', async () => {
		await setEndpoint({});
		expect(await redispatchLastReview(pendingShipId)).toBe('noDecision');
		expect(await redispatchLastReview(`${prefix}Missing`)).toBe('noDecision');
		expect(await deliveries()).toEqual([]);
	});

	test('queued writes exactly one pending delivery', async () => {
		await setEndpoint({});
		expect(await redispatchLastReview(decidedShipId)).toBe('queued');
		const rows = await deliveries();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			event: 'review.approved',
			submissionId: decidedShipId,
			url: safeUrl,
			status: 'PENDING'
		});
		expect(JSON.parse(rows[0].payload!)).toMatchObject({
			event: 'review.approved',
			id: decidedShipId
		});
		expect(await queueFailures()).toEqual([]);
	});
});

describe('dispatchShipUpdatedWebhook outcome', () => {
	const shipUpdate = async () => {
		const submission = await db.submission.findUniqueOrThrow({
			where: { id: decidedShipId },
			include: { maker: true, collaborators: { include: { maker: true } } }
		});
		return {
			programId,
			submissionId: decidedShipId,
			externalId: decidedShipId,
			editorId: reviewerId,
			changes: [{ field: 'title', label: 'Title', from: 'Old', to: decidedShipId }],
			ship: buildShipSnapshot(submission)
		};
	};

	test('reports the same outcomes as a review dispatch', async () => {
		expect(await dispatchShipUpdatedWebhook(await shipUpdate())).toBe('noEndpoint');
		await setEndpoint({ url: 'http://127.0.0.1/hook' });
		expect(await dispatchShipUpdatedWebhook(await shipUpdate())).toBe('blockedUrl');
		expect(await deliveries()).toEqual([]);
		await db.outboundEndpoint.update({ where: { programId }, data: { url: safeUrl } });
		expect(await dispatchShipUpdatedWebhook(await shipUpdate())).toBe('queued');
		expect(await deliveries()).toMatchObject([{ event: 'ship.updated', status: 'PENDING' }]);
	});
});

describe('people order in a review payload', () => {
	const teamShipId = `${prefix}Team`;
	// insertion order, maker id order and row id order all differ, so only the pinned one can pass
	const insertionOrder = ['Third', 'First', 'Second'];

	beforeAll(async () => {
		await db.maker.createMany({
			data: insertionOrder.map((name) => ({
				id: `${prefix}Maker${name}`,
				email: `${prefix}${name}@example.com`.toLowerCase()
			}))
		});
		await db.submission.create({
			data: {
				id: teamShipId,
				status: 'approved',
				programId,
				externalId: teamShipId,
				makerId: `${prefix}MakerThird`,
				title: teamShipId,
				repoUrl: 'https://github.com/maker/ship',
				claimedHours: 1
			}
		});
		const rowIds = { Third: 'row2', First: 'row3', Second: 'row1' };
		for (const name of insertionOrder) {
			await db.submissionCollaborator.create({
				data: {
					id: `${prefix}${rowIds[name as keyof typeof rowIds]}`,
					submissionId: teamShipId,
					makerId: `${prefix}Maker${name}`
				}
			});
		}
		await db.review.create({
			data: {
				submissionId: teamShipId,
				reviewerId,
				decision: 'approved',
				noteToMaker: 'Nice',
				auditNote: 'checked',
				fieldValues: {},
				checklist: {}
			}
		});
	});

	test('collaborators and ship.authors follow the collaborator row id', async () => {
		await setEndpoint({});
		expect(await redispatchLastReview(teamShipId)).toBe('queued');
		const [delivery] = await deliveries();
		const payload = JSON.parse(delivery.payload ?? '{}') as {
			collaborators: { email: string }[];
			ship: { authors: { email: string }[] };
		};
		const byRowId = ['Second', 'Third', 'First'].map((name) =>
			`${prefix}${name}@example.com`.toLowerCase()
		);
		expect(payload.collaborators.map((person) => person.email)).toEqual(byRowId);
		expect(payload.ship.authors.map((person) => person.email)).toEqual(byRowId);
	});
});
