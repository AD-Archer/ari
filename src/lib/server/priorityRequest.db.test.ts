import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { encrypt } from '$lib/server/crypto';
import {
	priorityIdentCookie,
	readMakerIdentity,
	setMakerIdentityCookie,
	type MakerIdentity
} from './priorityForm';
import { loadPriorityForm, markPriority } from './priorityRequest';

const prefix = `priorityTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const openProgram = `${prefix}Open`;
const closedProgram = `${prefix}Closed`;
const archivedProgram = `${prefix}Archived`;
const programIds = [openProgram, closedProgram, archivedProgram];
const openToken = `${prefix}OpenToken`;
const closedToken = `${prefix}ClosedToken`;
const archivedToken = `${prefix}ArchivedToken`;
const maker = `${prefix}Maker`;
const stranger = `${prefix}Stranger`;
const ownShip = `${prefix}OwnShip`;
const sharedShip = `${prefix}SharedShip`;
const strangerShip = `${prefix}StrangerShip`;
const decidedShip = `${prefix}DecidedShip`;
const closedShip = `${prefix}ClosedShip`;
const archivedShip = `${prefix}ArchivedShip`;
const shipIds = [ownShip, sharedShip, strangerShip, decidedShip, closedShip, archivedShip];

const emailOf = (makerId: string) => `${makerId.toLowerCase()}@example.com`;
const identity: MakerIdentity = { email: emailOf(maker), slackId: null, name: null };

const cookieJar = (initial: Record<string, string> = {}) => {
	const stored = { ...initial };
	const cookies = {
		get: (name: string) => stored[name],
		set: (name: string, value: string) => {
			stored[name] = value;
		},
		delete: (name: string) => {
			delete stored[name];
		}
	} as unknown as Cookies;
	return { cookies, stored };
};

const priorityOf = async (id: string) =>
	(await db.submission.findUniqueOrThrow({ where: { id }, select: { priority: true } })).priority;

const priorityEvents = () =>
	db.activityEvent.findMany({
		where: { programId: { in: programIds }, kind: 'PRIORITY' },
		select: { submissionId: true, meta: true, actorId: true }
	});

const refusal = async (attempt: Promise<unknown>) => {
	try {
		await attempt;
	} catch (thrown) {
		return (thrown as { status?: number }).status;
	}
	return 'no refusal';
};

beforeAll(async () => {
	await db.program.createMany({
		data: [
			{ id: openProgram, name: prefix, color: '#338eda', priorityReview: true },
			{ id: closedProgram, name: prefix, color: '#338eda', priorityReview: false },
			{ id: archivedProgram, name: prefix, color: '#338eda', priorityReview: true }
		].map((program, index) => ({
			...program,
			status: program.id === archivedProgram ? ('ARCHIVED' as const) : ('ACTIVE' as const),
			priorityReviewToken: [openToken, closedToken, archivedToken][index]
		}))
	});
	await db.maker.createMany({
		data: [maker, stranger].map((id) => ({ id, email: emailOf(id) }))
	});
	const ship = (id: string, programId: string, makerId: string) => ({
		id,
		programId,
		externalId: id,
		makerId,
		title: id,
		repoUrl: 'https://example.com/repo',
		claimedHours: 1
	});
	await db.submission.createMany({
		data: [
			ship(ownShip, openProgram, maker),
			ship(sharedShip, openProgram, stranger),
			ship(strangerShip, openProgram, stranger),
			{ ...ship(decidedShip, openProgram, maker), status: 'approved' as const },
			ship(closedShip, closedProgram, maker),
			ship(archivedShip, archivedProgram, maker)
		]
	});
	await db.submissionCollaborator.create({ data: { submissionId: sharedShip, makerId: maker } });
});

beforeEach(async () => {
	await db.activityEvent.deleteMany({ where: { programId: { in: programIds } } });
	await db.submission.updateMany({ where: { id: { in: shipIds } }, data: { priority: false } });
});

afterAll(async () => {
	await db.activityEvent.deleteMany({ where: { programId: { in: programIds } } });
	await db.submissionCollaborator.deleteMany({ where: { submissionId: { in: shipIds } } });
	await db.submission.deleteMany({ where: { id: { in: shipIds } } });
	await db.program.deleteMany({ where: { id: { in: programIds } } });
	await db.maker.deleteMany({ where: { id: { in: [maker, stranger] } } });
});

describe('form token', () => {
	test('a malformed token is refused before any lookup', async () => {
		for (const token of [
			'',
			'short',
			'has spaces in the token',
			`${openToken}/../x`,
			'%'.repeat(24)
		]) {
			expect(await refusal(loadPriorityForm(token, identity))).toBe(404);
			expect(await refusal(markPriority(token, identity, [ownShip]))).toBe(404);
		}
		expect(await priorityOf(ownShip)).toBe(false);
	});

	test('a well-formed token no program owns is refused', async () => {
		const unknown = `${prefix}NobodyHasThisToken`;
		expect(await refusal(loadPriorityForm(unknown, identity))).toBe(404);
		expect(await refusal(markPriority(unknown, identity, [ownShip]))).toBe(404);
		expect(await priorityOf(ownShip)).toBe(false);
	});
});

describe('closed form', () => {
	test('a program with priority review off shows closed and marks nothing', async () => {
		const form = await loadPriorityForm(closedToken, identity);
		expect(form.open).toBe(false);
		expect(form.ident).toBeNull();
		expect(form.ships).toEqual([]);

		const result = await markPriority(closedToken, identity, [closedShip]);
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(await priorityOf(closedShip)).toBe(false);
	});

	test('an archived program is closed even with priority review on', async () => {
		expect((await loadPriorityForm(archivedToken, identity)).open).toBe(false);
		expect(await markPriority(archivedToken, identity, [archivedShip])).toMatchObject({
			ok: false,
			status: 403
		});
		expect(await priorityOf(archivedShip)).toBe(false);
	});
});

describe('maker identity', () => {
	test('no cookie, a garbage cookie and an expired cookie all read as signed out', () => {
		expect(readMakerIdentity(cookieJar().cookies)).toBeNull();
		expect(
			readMakerIdentity(cookieJar({ [priorityIdentCookie]: 'not-sealed' }).cookies)
		).toBeNull();
		const expired = encrypt(JSON.stringify({ ...identity, exp: Date.now() - 1000 }));
		expect(readMakerIdentity(cookieJar({ [priorityIdentCookie]: expired }).cookies)).toBeNull();
		// a json cookie that was never sealed with the server key
		const forged = JSON.stringify({ ...identity, exp: Date.now() + 100000 });
		expect(readMakerIdentity(cookieJar({ [priorityIdentCookie]: forged }).cookies)).toBeNull();
	});

	test('the cookie the callback sets reads back as that maker', () => {
		const jar = cookieJar();
		setMakerIdentityCookie(jar.cookies, identity);
		expect(readMakerIdentity(jar.cookies)).toEqual(identity);
	});

	test('signed out, the form asks for sign-in, lists nothing and cannot submit', async () => {
		const form = await loadPriorityForm(openToken, null);
		expect(form.open).toBe(true);
		expect(form.ident).toBeNull();
		expect(form.ships).toEqual([]);

		expect(await markPriority(openToken, null, [ownShip])).toMatchObject({
			ok: false,
			status: 401
		});
		expect(await priorityOf(ownShip)).toBe(false);
		expect(await priorityEvents()).toEqual([]);
	});
});

describe('marking', () => {
	test('a maker sees only their own open ships', async () => {
		const form = await loadPriorityForm(openToken, identity);
		expect(form.ident?.email).toBe(identity.email);
		expect(form.ships.map((ship) => ship.id).sort()).toEqual([ownShip, sharedShip].sort());
	});

	test('posted ids outside the maker’s own open ships in this program are ignored', async () => {
		const result = await markPriority(openToken, identity, [
			ownShip,
			strangerShip,
			decidedShip,
			closedShip,
			archivedShip
		]);
		expect(result).toEqual({ ok: true, marked: 1 });
		expect(await priorityOf(ownShip)).toBe(true);
		for (const id of [strangerShip, decidedShip, closedShip, archivedShip])
			expect(await priorityOf(id)).toBe(false);

		const events = await priorityEvents();
		expect(events).toHaveLength(1);
		expect(events[0].submissionId).toBe(ownShip);
		expect(events[0].actorId).toBeNull();
		expect(events[0].meta).toMatchObject({ email: identity.email, submissionId: ownShip });
	});

	test('only someone else’s ships posted marks nothing', async () => {
		expect(await markPriority(openToken, identity, [strangerShip])).toEqual({
			ok: true,
			marked: 0
		});
		expect(await priorityOf(strangerShip)).toBe(false);
		expect(await priorityEvents()).toEqual([]);
	});

	test('a collaborator may mark the shared ship', async () => {
		expect(await markPriority(openToken, identity, [sharedShip])).toEqual({ ok: true, marked: 1 });
		expect(await priorityOf(sharedShip)).toBe(true);
	});

	test('marking twice writes one event', async () => {
		expect(await markPriority(openToken, identity, [ownShip, ownShip])).toEqual({
			ok: true,
			marked: 1
		});
		expect(await markPriority(openToken, identity, [ownShip])).toEqual({ ok: true, marked: 0 });
		expect(await priorityEvents()).toHaveLength(1);
	});

	test('an empty or oversized selection is refused', async () => {
		expect(await markPriority(openToken, identity, [])).toMatchObject({ ok: false, status: 400 });
		expect(await markPriority(openToken, identity, [''])).toMatchObject({ ok: false, status: 400 });
		// 201: one over the per-request cap
		const tooMany = Array.from({ length: 201 }, (unused, index) => `${prefix}Ship${index}`);
		expect(await markPriority(openToken, identity, tooMany)).toMatchObject({
			ok: false,
			status: 400
		});
	});
});
