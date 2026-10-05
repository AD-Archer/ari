import { afterAll, beforeAll, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { medianSeconds, reviewTime } from './reviewTime';

const prefix = `reviewTimeTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const programId = `${prefix}Program`;
const reviewerId = `${prefix}Reviewer`;
const makerId = `${prefix}Maker`;

const since = new Date('2026-03-10T00:00:00.000Z');
const software = { track: { in: ['software' as const] } };
const hardware = { track: { in: ['hardware' as const] } };

const shipId = (name: string) => `${prefix}Ship${name}`;
const at = (text: string) => new Date(`2026-03-${text}Z`);

type ShipRow = {
	name: string;
	status: 'approved' | 'changes' | 'rejected' | 'reverted' | 'secondpass';
	ingestedAt: Date;
	track?: 'hardware';
	externalId?: string;
	version?: number;
	queuedAt?: Date;
};

const ships: ShipRow[] = [
	{ name: 'FirstPass', status: 'approved', ingestedAt: at('10T00:00:00') },
	{ name: 'Held', status: 'secondpass', ingestedAt: at('10T00:00:00') },
	{ name: 'Override', status: 'rejected', ingestedAt: at('10T00:00:00') },
	{ name: 'Reverted', status: 'reverted', ingestedAt: at('10T00:00:00') },
	{
		name: 'Original',
		status: 'changes',
		ingestedAt: at('01T00:00:00'),
		externalId: `${prefix}Project`
	},
	{
		name: 'Reship',
		status: 'approved',
		ingestedAt: at('11T00:00:00'),
		externalId: `${prefix}Project`,
		version: 2,
		queuedAt: at('01T00:00:00')
	},
	{ name: 'Hardware', status: 'approved', ingestedAt: at('10T00:00:00'), track: 'hardware' },
	{ name: 'Boundary', status: 'approved', ingestedAt: at('09T21:00:00') },
	{ name: 'BeforeWindow', status: 'approved', ingestedAt: at('09T00:00:00') },
	{ name: 'Requeued', status: 'approved', ingestedAt: at('10T00:00:00') },
	{ name: 'Automated', status: 'rejected', ingestedAt: at('10T00:00:00') },
	{ name: 'Migrated', status: 'approved', ingestedAt: at('12T00:00:00') }
];

type EventRow = {
	ship: string;
	kind: 'APPROVED' | 'CHANGES' | 'REJECTED';
	createdAt: Date;
	meta?: object;
};

const pending = { secondPass: 'pending' };
const events: EventRow[] = [
	{ ship: 'FirstPass', kind: 'APPROVED', createdAt: at('10T01:00:00') },
	{ ship: 'Held', kind: 'APPROVED', createdAt: at('11T18:00:00'), meta: pending },
	{ ship: 'Override', kind: 'APPROVED', createdAt: at('10T01:00:00'), meta: pending },
	{
		ship: 'Override',
		kind: 'REJECTED',
		createdAt: at('10T05:00:00'),
		meta: { op: 'second-pass-overridden' }
	},
	{ ship: 'Reverted', kind: 'APPROVED', createdAt: at('10T00:30:00') },
	{ ship: 'Original', kind: 'CHANGES', createdAt: at('02T00:00:00') },
	{ ship: 'Reship', kind: 'APPROVED', createdAt: at('11T02:00:00') },
	{ ship: 'Hardware', kind: 'APPROVED', createdAt: at('10T00:30:00') },
	{ ship: 'Boundary', kind: 'APPROVED', createdAt: since },
	{ ship: 'BeforeWindow', kind: 'APPROVED', createdAt: at('09T23:59:59.999') },
	{ ship: 'Requeued', kind: 'REJECTED', createdAt: at('10T01:00:00') },
	{ ship: 'Requeued', kind: 'APPROVED', createdAt: at('10T04:00:00') },
	{ ship: 'Automated', kind: 'REJECTED', createdAt: at('10T00:00:05'), meta: { auto: true } },
	{ ship: 'Migrated', kind: 'APPROVED', createdAt: at('11T00:00:00') }
];

beforeAll(async () => {
	await db.user.create({
		data: {
			id: reviewerId,
			email: `${reviewerId.toLowerCase()}@example.com`,
			name: reviewerId,
			avatarColor: '#338eda'
		}
	});
	await db.program.create({ data: { id: programId, name: `${prefix} one`, color: '#338eda' } });
	await db.maker.create({ data: { id: makerId, email: `${makerId.toLowerCase()}@example.com` } });
	await db.submission.createMany({
		data: ships.map((ship) => ({
			id: shipId(ship.name),
			programId,
			externalId: ship.externalId ?? shipId(ship.name),
			version: ship.version ?? 1,
			makerId,
			title: shipId(ship.name),
			repoUrl: 'https://example.com/repo',
			claimedHours: 1,
			status: ship.status,
			track: ship.track ?? ('software' as const),
			receivedAt: ship.ingestedAt,
			ingestedAt: ship.ingestedAt,
			queuedAt: ship.queuedAt ?? ship.ingestedAt
		}))
	});
	await db.activityEvent.createMany({
		data: events.map((event) => ({
			programId,
			kind: event.kind,
			actorId: reviewerId,
			submissionId: shipId(event.ship),
			text: `event for ${event.ship}`,
			createdAt: event.createdAt,
			meta: event.meta ?? {}
		}))
	});
});

afterAll(async () => {
	await db.activityEvent.deleteMany({ where: { programId } });
	await db.submission.deleteMany({ where: { programId } });
	await db.program.deleteMany({ where: { id: programId } });
	await db.maker.deleteMany({ where: { id: makerId } });
	await db.user.deleteMany({ where: { id: reviewerId } });
});

test('the median of an even count is the lower middle', () => {
	expect(medianSeconds([])).toBeNull();
	expect(medianSeconds([5])).toBe(5);
	expect(medianSeconds([3, 1, 2])).toBe(2);
	expect(medianSeconds([4, 1, 3, 2])).toBe(2);
	expect(medianSeconds([10, 20])).toBe(10);
});

// counted: hardware 1800, first pass 3600, re-ship 7200, boundary 10800, requeued 14400, override 18000
test('final decisions in the window are measured from arrival', async () => {
	expect(await reviewTime(programId, since)).toEqual({ medianSeconds: 7200, decisions: 6 });
});

test('track scope limits which ships are measured', async () => {
	expect(await reviewTime(programId, since, software)).toEqual({
		medianSeconds: 10800,
		decisions: 5
	});
	expect(await reviewTime(programId, since, hardware)).toEqual({
		medianSeconds: 1800,
		decisions: 1
	});
});

test('a decision at the first instant of the window counts and one before it does not', async () => {
	const justAfter = new Date(since.getTime() + 1);
	expect((await reviewTime(programId, since)).decisions).toBe(6);
	expect((await reviewTime(programId, justAfter)).decisions).toBe(5);
	const widened = await reviewTime(programId, at('09T23:59:59.999'));
	expect(widened.decisions).toBe(7);
});

test('an override is measured to the second pass, not the held decision', async () => {
	const result = await reviewTime(programId, at('10T04:30:00'), software);
	// the override at five hours and the re-ship, which took two hours from its own arrival
	expect(result).toEqual({ medianSeconds: 7200, decisions: 2 });
});

test('a held decision counts only once confirmed, measured to the confirm', async () => {
	const window = at('11T12:00:00');
	expect(await reviewTime(programId, window)).toEqual({ medianSeconds: null, decisions: 0 });

	await db.submission.update({ where: { id: shipId('Held') }, data: { status: 'approved' } });
	await db.activityEvent.create({
		data: {
			programId,
			kind: 'APPROVED',
			actorId: reviewerId,
			submissionId: shipId('Held'),
			text: 'event for Held',
			createdAt: at('12T00:00:00'),
			meta: { op: 'second-pass-confirmed' }
		}
	});
	// two days from arrival to the confirm: 2 * 24 * 60 * 60
	expect(await reviewTime(programId, window)).toEqual({ medianSeconds: 172800, decisions: 1 });
});

test('a program with no decisions has no median', async () => {
	expect(await reviewTime(`${prefix}Missing`, since)).toEqual({
		medianSeconds: null,
		decisions: 0
	});
});
