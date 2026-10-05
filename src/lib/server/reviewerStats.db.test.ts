import { afterAll, beforeAll, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import type { OrgPermission } from '$lib/data';
import { crossProgramStats, parseRange, rangeActive, reviewerOverview } from './reviewerStats';

const prefix = `reviewerStatsTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const programId = `${prefix}ProgramOne`;
const otherProgramId = `${prefix}ProgramTwo`;
const reviewerId = `${prefix}Reviewer`;
const colleagueId = `${prefix}Colleague`;
const makerId = `${prefix}Maker`;
const softwareShip = `${prefix}ShipSoftware`;
const hardwareShip = `${prefix}ShipHardware`;
const legacyShip = `${prefix}ShipLegacy`;
const otherProgramShip = `${prefix}ShipElsewhere`;
const shipIds = [softwareShip, hardwareShip, legacyShip, otherProgramShip];

const now = new Date('2026-03-17T12:00:00.000Z').getTime();
const rangeFor = (query: string) => parseRange(new URLSearchParams(query));

function viewerWith(
	orgPermissions: OrgPermission[],
	memberships: App.SessionUser['memberships'] = []
): App.SessionUser {
	return {
		id: `${prefix}Viewer`,
		email: `${prefix.toLowerCase()}.viewer@example.com`,
		name: 'Viewer',
		namePending: false,
		avatarColor: '#338eda',
		slackId: null,
		orgPermissions,
		memberships
	};
}

const reviewBase = { noteToMaker: '', auditNote: '', fieldValues: {}, checklist: {} };

beforeAll(async () => {
	await db.user.createMany({
		data: [reviewerId, colleagueId].map((id) => ({
			id,
			email: `${id.toLowerCase()}@example.com`,
			name: id,
			avatarColor: '#338eda'
		}))
	});
	await db.program.createMany({
		data: [
			{ id: programId, name: `${prefix} one`, color: '#338eda' },
			{ id: otherProgramId, name: `${prefix} two`, color: '#ec3750' }
		]
	});
	await db.maker.create({ data: { id: makerId, email: `${makerId.toLowerCase()}@example.com` } });
	await db.submission.createMany({
		data: shipIds.map((id) => ({
			id,
			programId: id === otherProgramShip ? otherProgramId : programId,
			externalId: id,
			makerId,
			title: id,
			repoUrl: 'https://example.com/repo',
			claimedHours: 1,
			track: id === hardwareShip ? ('hardware' as const) : ('software' as const)
		}))
	});
	await db.review.createMany({
		data: [
			{
				...reviewBase,
				id: `${prefix}ReviewBefore`,
				submissionId: softwareShip,
				reviewerId,
				decision: 'rejected',
				settlementVersion: 3,
				approvedSeconds: 0,
				createdAt: new Date('2026-03-09T23:59:59.999Z')
			},
			{
				...reviewBase,
				id: `${prefix}ReviewFirstInstant`,
				submissionId: softwareShip,
				reviewerId,
				decision: 'approved',
				settlementVersion: 3,
				approvedMinutes: 61,
				approvedSeconds: 3661,
				createdAt: new Date('2026-03-10T00:00:00.000Z')
			},
			{
				...reviewBase,
				id: `${prefix}ReviewLastInstant`,
				submissionId: hardwareShip,
				reviewerId,
				decision: 'changes',
				settlementVersion: 3,
				approvedMinutes: 2,
				approvedSeconds: 125,
				createdAt: new Date('2026-03-12T23:59:59.999Z')
			},
			// a minute-only row from old ari: its seconds column was never written
			{
				...reviewBase,
				id: `${prefix}ReviewAfter`,
				submissionId: legacyShip,
				reviewerId,
				decision: 'approved',
				settlementVersion: 1,
				approvedMinutes: 10,
				approvedSeconds: 0,
				createdAt: new Date('2026-03-13T00:00:00.000Z')
			},
			{
				...reviewBase,
				id: `${prefix}ReviewElsewhere`,
				submissionId: otherProgramShip,
				reviewerId,
				decision: 'approved',
				settlementVersion: 3,
				approvedSeconds: 500,
				createdAt: new Date('2026-03-11T09:00:00.000Z')
			},
			{
				...reviewBase,
				id: `${prefix}ReviewColleague`,
				submissionId: softwareShip,
				reviewerId: colleagueId,
				decision: 'approved',
				settlementVersion: 3,
				approvedSeconds: 9999,
				createdAt: new Date('2026-03-11T09:00:00.000Z')
			}
		]
	});
	await db.activityEvent.createMany({
		data: [
			{
				programId,
				kind: 'APPROVED',
				actorId: reviewerId,
				text: 'confirmed',
				meta: { op: 'second-pass-confirmed' },
				createdAt: new Date('2026-03-11T13:00:00.000Z')
			},
			{
				programId,
				kind: 'REJECTED',
				actorId: reviewerId,
				text: 'overridden',
				meta: { op: 'second-pass-overridden' },
				createdAt: new Date('2026-03-20T13:00:00.000Z')
			},
			// a plain decision event is already counted through its review row
			{
				programId,
				kind: 'APPROVED',
				actorId: reviewerId,
				text: 'approved',
				createdAt: new Date('2026-03-11T13:00:00.000Z')
			}
		]
	});
	await db.reviewerVm.createMany({
		data: [
			{ submissionId: softwareShip, programId, createdAt: new Date('2026-03-11T10:00:00.000Z') },
			{ submissionId: hardwareShip, programId, createdAt: new Date('2026-03-20T10:00:00.000Z') },
			{
				submissionId: otherProgramShip,
				programId: otherProgramId,
				createdAt: new Date('2026-03-11T10:00:00.000Z')
			}
		].map((launch, index) => ({
			...launch,
			reviewerId,
			vmid: index,
			vmType: 'linux',
			name: `${prefix}Vm${index}`,
			guacUrl: 'https://example.com/vm'
		}))
	});
	await db.submissionOpen.create({
		data: {
			submissionId: softwareShip,
			reviewerId,
			openedAt: new Date('2026-03-11T10:00:00.000Z'),
			closedAt: new Date('2026-03-11T10:30:00.000Z'),
			closeReason: 'left'
		}
	});
});

afterAll(async () => {
	await db.activityEvent.deleteMany({ where: { programId: { in: [programId, otherProgramId] } } });
	await db.reviewerVm.deleteMany({ where: { reviewerId } });
	await db.submissionOpen.deleteMany({ where: { reviewerId } });
	await db.review.deleteMany({ where: { submissionId: { in: shipIds } } });
	await db.submission.deleteMany({ where: { id: { in: shipIds } } });
	await db.program.deleteMany({ where: { id: { in: [programId, otherProgramId] } } });
	await db.maker.deleteMany({ where: { id: makerId } });
	await db.user.deleteMany({ where: { id: { in: [reviewerId, colleagueId] } } });
});

test('a range is a half-open utc window and a malformed bound is ignored', () => {
	const range = rangeFor('from=2026-03-10&to=2026-03-12');
	expect(range.since?.toISOString()).toBe('2026-03-10T00:00:00.000Z');
	expect(range.until?.toISOString()).toBe('2026-03-13T00:00:00.000Z');
	expect(range.from).toBe('2026-03-10');
	expect(range.to).toBe('2026-03-12');
	expect(rangeActive(range)).toBe(true);

	const malformed = rangeFor('from=yesterday&to=2026-3-1');
	expect(malformed).toEqual({ since: null, until: null, from: null, to: null });
	expect(rangeActive(malformed)).toBe(false);

	expect(rangeFor('to=2026-03-12').since).toBeNull();
});

test('all-time totals cover this program only, across both tracks and settlement versions', async () => {
	const { stats, recent, vms } = await reviewerOverview(programId, reviewerId, rangeFor(''), now);
	// 0 + 3661 + 125 + 10 legacy minutes as 600
	expect(stats.approvedSeconds).toBe(4386);
	expect(stats.directTotal).toBe(4);
	expect(stats.secondPass).toBe(2);
	expect(stats.total).toBe(6);
	// two direct approvals and one confirmed second pass out of six
	expect(stats.approvalPercent).toBe(50);
	expect(stats.vmCount).toBe(2);
	expect(vms.map((launch) => launch.submissionId)).toEqual([hardwareShip, softwareShip]);
	expect(stats.sessionCount).toBe(1);
	expect(stats.timeWorkedMs).toBe(1800000);
	expect(recent.map((review) => review.id)).toEqual([
		`${prefix}ReviewAfter`,
		`${prefix}ReviewLastInstant`,
		`${prefix}ReviewFirstInstant`,
		`${prefix}ReviewBefore`
	]);
	expect(recent.map((review) => review.approvedSeconds)).toEqual([600, 125, 3661, 0]);
	// the hardware ship counts: the profile is not narrowed to anyone's track scope
	expect(recent.map((review) => review.track)).toContain('hardware');
});

test('from is inclusive at midnight utc and to includes its whole day', async () => {
	const { stats, recent, vms } = await reviewerOverview(
		programId,
		reviewerId,
		rangeFor('from=2026-03-10&to=2026-03-12'),
		now
	);
	expect(recent.map((review) => review.id)).toEqual([
		`${prefix}ReviewLastInstant`,
		`${prefix}ReviewFirstInstant`
	]);
	expect(stats.approvedSeconds).toBe(3786);
	expect(stats.directTotal).toBe(2);
	expect(stats.secondPass).toBe(1);
	expect(stats.total).toBe(3);
	expect(stats.approvalPercent).toBe(67);
	expect(stats.vmCount).toBe(1);
	expect(vms[0].submissionId).toBe(softwareShip);
	expect(stats.sessionCount).toBe(1);
});

test('a one-sided range bounds only that side', async () => {
	const after = await reviewerOverview(programId, reviewerId, rangeFor('from=2026-03-13'), now);
	expect(after.stats.approvedSeconds).toBe(600);
	expect(after.stats.directTotal).toBe(1);
	expect(after.stats.secondPass).toBe(1);
	expect(after.stats.sessionCount).toBe(0);

	const before = await reviewerOverview(programId, reviewerId, rangeFor('to=2026-03-09'), now);
	expect(before.stats.approvedSeconds).toBe(0);
	expect(before.stats.directTotal).toBe(1);
	expect(before.stats.total).toBe(1);
	expect(before.stats.approvalPercent).toBe(0);
	expect(before.stats.vmCount).toBe(0);
});

test('the weekly count ignores the range', async () => {
	// seven days back from the fixed now is 10 march noon: two direct reviews and both second passes
	for (const query of ['', 'to=2026-03-09']) {
		const { stats } = await reviewerOverview(programId, reviewerId, rangeFor(query), now);
		expect(stats.week).toBe(4);
	}
});

test('cross-program rows are for org operators only', async () => {
	const operator = await crossProgramStats(
		viewerWith(['OPERATE_ALL_PROGRAMS']),
		reviewerId,
		programId
	);
	expect(operator).toEqual({
		totalReviews: 5,
		approvedSeconds: 4886,
		totalVms: 3,
		programs: [
			{
				programId,
				name: `${prefix} one`,
				color: '#338eda',
				reviews: 4,
				approvedSeconds: 4386,
				vms: 2,
				current: true
			},
			{
				programId: otherProgramId,
				name: `${prefix} two`,
				color: '#ec3750',
				reviews: 1,
				approvedSeconds: 500,
				vms: 1,
				current: false
			}
		]
	});

	// a poc of this program cannot open the other one, and the org view tier is read-only
	const poc = viewerWith([], [{ programId, permissions: [], isPoc: true, tracks: ['software'] }]);
	expect(await crossProgramStats(poc, reviewerId, programId)).toBeNull();
	expect(
		await crossProgramStats(viewerWith(['VIEW_ALL_PROGRAMS']), reviewerId, programId)
	).toBeNull();
});
