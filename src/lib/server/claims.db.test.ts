import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import {
	canActOnSubmission,
	claimSubmission,
	claimTtlMs,
	heartbeatClaim,
	isClaimStale,
	releaseClaim,
	takeoverClaim
} from './claims';

const prefix = `claimsTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const firstReviewer = `${prefix}ReviewerOne`;
const secondReviewer = `${prefix}ReviewerTwo`;
const programId = `${prefix}Program`;
const makerId = `${prefix}Maker`;
const shipId = `${prefix}Ship`;
const otherShipId = `${prefix}OtherShip`;

const pastTtl = () => new Date(Date.now() - claimTtlMs() - 60000); // 1 minute past stale: 60 * 1000

const shipState = (id = shipId) =>
	db.submission.findUniqueOrThrow({
		where: { id },
		select: { claimedById: true, claimedAt: true, status: true }
	});

const opensFor = (submissionId = shipId) =>
	db.submissionOpen.findMany({
		where: { submissionId },
		orderBy: { openedAt: 'asc' },
		select: { reviewerId: true, closedAt: true, closeReason: true }
	});

const ageClaim = (id = shipId) =>
	db.submission.update({ where: { id }, data: { claimedAt: pastTtl() } });

beforeAll(async () => {
	await db.user.createMany({
		data: [firstReviewer, secondReviewer].map((id) => ({
			id,
			email: `${id}@example.com`,
			name: id,
			avatarColor: '#338eda'
		}))
	});
	await db.program.create({ data: { id: programId, name: prefix, color: '#338eda' } });
	await db.maker.create({ data: { id: makerId, email: `${makerId}@example.com` } });
	await db.submission.createMany({
		data: [shipId, otherShipId].map((id) => ({
			id,
			programId,
			externalId: id,
			makerId,
			title: id,
			repoUrl: 'https://example.com/repo',
			claimedHours: 1
		}))
	});
});

beforeEach(async () => {
	await db.submissionOpen.deleteMany({ where: { submissionId: { in: [shipId, otherShipId] } } });
	await db.submission.updateMany({
		where: { id: { in: [shipId, otherShipId] } },
		data: { claimedById: null, claimedAt: null, status: 'pending' }
	});
});

afterAll(async () => {
	await db.submission.deleteMany({ where: { id: { in: [shipId, otherShipId] } } });
	await db.program.deleteMany({ where: { id: programId } });
	await db.maker.deleteMany({ where: { id: makerId } });
	await db.user.deleteMany({ where: { id: { in: [firstReviewer, secondReviewer] } } });
});

describe('claimSubmission', () => {
	test('claims a free ship and opens one session', async () => {
		expect(await claimSubmission(shipId, firstReviewer)).toEqual({ ok: true });
		const ship = await shipState();
		expect(ship.claimedById).toBe(firstReviewer);
		expect(isClaimStale(ship.claimedAt)).toBe(false);
		expect(await opensFor()).toEqual([
			{ reviewerId: firstReviewer, closedAt: null, closeReason: null }
		]);
	});

	test('re-claiming a live claim refreshes it without a second session', async () => {
		await claimSubmission(shipId, firstReviewer);
		const before = (await shipState()).claimedAt!;
		await Bun.sleep(5);
		expect(await claimSubmission(shipId, firstReviewer)).toEqual({ ok: true });
		expect((await shipState()).claimedAt!.getTime()).toBeGreaterThan(before.getTime());
		expect(await opensFor()).toHaveLength(1);
	});

	test('a second reviewer is refused while the claim is live', async () => {
		await claimSubmission(shipId, firstReviewer);
		const refused = await claimSubmission(shipId, secondReviewer);
		expect(refused.ok).toBe(false);
		if (refused.ok || refused.reason !== 'locked') throw new Error('expected locked');
		expect(refused.by.byId).toBe(firstReviewer);
		expect(refused.by.byName).toBe(firstReviewer);
		expect((await shipState()).claimedById).toBe(firstReviewer);
		expect(await opensFor()).toHaveLength(1);
		expect(await canActOnSubmission(shipId, secondReviewer)).toBe(false);
		expect(await canActOnSubmission(shipId, firstReviewer)).toBe(true);
	});

	test('a stale claim is taken over and the displaced session closes as idle', async () => {
		await claimSubmission(shipId, firstReviewer);
		await ageClaim();
		expect(await canActOnSubmission(shipId, secondReviewer)).toBe(true);
		expect(await claimSubmission(shipId, secondReviewer)).toEqual({ ok: true });
		expect((await shipState()).claimedById).toBe(secondReviewer);
		const opens = await opensFor();
		expect(opens).toHaveLength(2);
		expect(opens[0].reviewerId).toBe(firstReviewer);
		expect(opens[0].closeReason).toBe('idle');
		expect(opens[0].closedAt).not.toBeNull();
		expect(opens[1]).toEqual({ reviewerId: secondReviewer, closedAt: null, closeReason: null });
	});

	test('re-claiming your own stale claim closes the stale session before opening a new one', async () => {
		await claimSubmission(shipId, firstReviewer);
		await ageClaim();
		expect(await claimSubmission(shipId, firstReviewer)).toEqual({ ok: true });
		const opens = await opensFor();
		expect(opens).toHaveLength(2);
		expect(opens[0].closeReason).toBe('idle');
		expect(opens.filter((open) => open.closedAt === null)).toHaveLength(1);
	});

	test('claiming another ship frees the first and closes its session as left', async () => {
		await claimSubmission(shipId, firstReviewer);
		expect(await claimSubmission(otherShipId, firstReviewer)).toEqual({ ok: true });
		expect((await shipState()).claimedById).toBeNull();
		expect((await shipState(otherShipId)).claimedById).toBe(firstReviewer);
		expect((await opensFor())[0].closeReason).toBe('left');
		expect(await claimSubmission(shipId, secondReviewer)).toEqual({ ok: true });
	});

	test('a ship that left the queue cannot be claimed', async () => {
		await db.submission.update({ where: { id: shipId }, data: { status: 'approved' } });
		expect(await claimSubmission(shipId, firstReviewer)).toEqual({ ok: false, reason: 'closed' });
		expect(await claimSubmission(`${prefix}Missing`, firstReviewer)).toEqual({
			ok: false,
			reason: 'closed'
		});
		expect(await opensFor()).toHaveLength(0);
		expect(await canActOnSubmission(shipId, secondReviewer)).toBe(true);
		expect(await canActOnSubmission(`${prefix}Missing`, secondReviewer)).toBe(false);
	});
});

describe('releaseClaim', () => {
	test('only the holder can release', async () => {
		await claimSubmission(shipId, firstReviewer);
		await releaseClaim(shipId, secondReviewer);
		expect((await shipState()).claimedById).toBe(firstReviewer);
		expect((await opensFor())[0].closedAt).toBeNull();
	});

	test('the holder releases, the session closes as left, and a double release is harmless', async () => {
		await claimSubmission(shipId, firstReviewer);
		await releaseClaim(shipId, firstReviewer);
		expect((await shipState()).claimedById).toBeNull();
		const closed = await opensFor();
		expect(closed).toHaveLength(1);
		expect(closed[0].closeReason).toBe('left');

		await claimSubmission(shipId, secondReviewer);
		await releaseClaim(shipId, firstReviewer);
		expect((await shipState()).claimedById).toBe(secondReviewer);
		const afterSecondRelease = await opensFor();
		expect(afterSecondRelease).toHaveLength(2);
		expect(afterSecondRelease[1].closedAt).toBeNull();
	});
});

describe('heartbeatClaim', () => {
	test('refreshes the holder and keeps the claim from going stale', async () => {
		await claimSubmission(shipId, firstReviewer);
		await ageClaim();
		expect(await heartbeatClaim(shipId, firstReviewer)).toBe(true);
		expect(isClaimStale((await shipState()).claimedAt)).toBe(false);
		expect((await claimSubmission(shipId, secondReviewer)).ok).toBe(false);
	});

	test('does nothing for a non-holder', async () => {
		await claimSubmission(shipId, firstReviewer);
		const before = (await shipState()).claimedAt!;
		expect(await heartbeatClaim(shipId, secondReviewer)).toBe(false);
		expect((await shipState()).claimedAt!.getTime()).toBe(before.getTime());
	});

	test('does not keep a claim fresh on a ship that left the queue', async () => {
		await claimSubmission(shipId, firstReviewer);
		const stale = pastTtl();
		await db.submission.update({
			where: { id: shipId },
			data: { status: 'approved', claimedAt: stale }
		});
		expect(await heartbeatClaim(shipId, firstReviewer)).toBe(false);
		expect((await shipState()).claimedAt!.getTime()).toBe(stale.getTime());
	});
});

describe('takeoverClaim', () => {
	test('takes a live claim, closes the holder as taken, and locks them out', async () => {
		await claimSubmission(shipId, firstReviewer);
		expect(await takeoverClaim(shipId, secondReviewer)).toEqual({ ok: true });
		expect((await shipState()).claimedById).toBe(secondReviewer);
		const opens = await opensFor();
		expect(opens).toHaveLength(2);
		expect(opens[0]).toMatchObject({ reviewerId: firstReviewer, closeReason: 'taken' });
		expect(opens[1]).toEqual({ reviewerId: secondReviewer, closedAt: null, closeReason: null });
		expect(await heartbeatClaim(shipId, firstReviewer)).toBe(false);
	});

	test('re-taking your own live claim is not a new session, a stale one is', async () => {
		await claimSubmission(shipId, firstReviewer);
		expect(await takeoverClaim(shipId, firstReviewer)).toEqual({ ok: true });
		expect(await opensFor()).toHaveLength(1);

		await ageClaim();
		expect(await takeoverClaim(shipId, firstReviewer)).toEqual({ ok: true });
		const opens = await opensFor();
		expect(opens).toHaveLength(2);
		expect(opens[0].closeReason).toBe('idle');
		expect(opens[1].closedAt).toBeNull();
	});

	test('refuses a ship that left the queue', async () => {
		await db.submission.update({ where: { id: shipId }, data: { status: 'rejected' } });
		expect(await takeoverClaim(shipId, secondReviewer)).toEqual({ ok: false, reason: 'closed' });
		expect((await shipState()).claimedById).toBeNull();
	});
});
