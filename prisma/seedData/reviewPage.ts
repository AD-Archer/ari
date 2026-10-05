import type { PrismaClient } from '../../generated/prisma/client';
import { draftColumns } from '../../src/lib/server/settlementStore';
import { daysAgo } from './shared';
import { notesFor } from './ships';

async function seedDrafts(db: PrismaClient) {
	const devlog = await db.devlog.findFirst({
		where: { submissionId: 'seedShipWeather' },
		orderBy: { at: 'asc' }
	});
	await db.draft.create({
		data: {
			submissionId: 'seedShipWeather',
			reviewerId: 'seedUserSoftware',
			note: 'note to maker 1.',
			audit: notesFor(1).auditNote,
			technicalFeatures: 'technical features 1.',
			deflationReason: 'deflation reason 1.',
			fieldValues: {},
			checks: [true, true, false],
			...draftColumns({
				// 20m: 20 * 60, down from the 30m captured
				adjustments: devlog ? { devlogs: { [devlog.id]: 1200 } } : {},
				deflateSeconds: 600 // 10m: 10 * 60
			})
		}
	});
	await db.draft.create({
		data: {
			submissionId: 'seedShipChess',
			reviewerId: 'seedUserSoftware',
			note: 'note to maker 2.',
			audit: '',
			fieldValues: {},
			checks: [true, false, false],
			collaboratorNotes: { seedMakerTomas: 'note to collaborator 1.' },
			...draftColumns({
				adjustments: {},
				collaboratorDeflates: { seedMakerNoor: 1800 } // 30m: 30 * 60
			})
		}
	});
}

const fileHours: [string, string, number, number | null, string][] = [
	['seedShipDegraded', 'src/file1.ts', 3127, 2890, 'head'],
	['seedShipDegraded', 'src/file2.ts', 4287, 3410, 'head'],
	['seedShipWeather', 'src/file1.ts', 6120, 4810, 'head'],
	['seedShipWeather', 'src/file2.ts', 4375, 3122, 'head'],
	['seedShipWeather', 'src/file3.ts', 2290, 1410, 'head'],
	['seedShipWeather', 'src/file4.ts', 1830, null, 'history'],
	['seedShipWeather', 'src/file5.ts', 942, null, 'none'],
	['seedShipChess', 'src/file1.ts', 9633, 7204, 'head'],
	['seedShipChess', 'src/file2.ts', 11645, 9120, 'head'],
	['seedShipChess', 'src/file3.ts', 4968, 3550, 'head'],
	['seedShipKeyboard', 'src/file1.ts', 3126, 5210, 'head'],
	['seedShipKeyboard', 'src/file2.ts', 14539, 482113, 'head'],
	['seedShipKeyboard', 'src/file3.ts', 5504, 96120, 'head'],
	['seedShipHeld', 'src/file1.ts', 7707, 6020, 'head'],
	['seedShipHeld', 'src/file2.ts', 3483, 2100, 'head']
];

const pastProjects: [
	string,
	string,
	string,
	string,
	string[],
	string,
	number,
	number | null,
	string?
][] = [
	[
		'seedShipWeather',
		'seedPast1',
		'pastproject1',
		'maker1@example.com',
		['Program 3'],
		'Description of past project 1.',
		16200,
		40,
		'/flag-hand.png'
	],
	[
		'seedShipWeather',
		'seedPast2',
		'pastproject2',
		'maker1@example.com',
		['Program 2'],
		'Description of past project 2.',
		30600,
		90
	],
	[
		'seedShipChess',
		'seedPast3',
		'pastproject3',
		'maker2@example.com',
		['Program 3'],
		'Description of past project 3.',
		21600,
		60
	],
	[
		'seedShipChess',
		'seedPast4',
		'pastproject4',
		'maker3@example.com',
		['Program 1'],
		'Description of past project 4.',
		12600,
		null
	],
	[
		'seedShipKeyboard',
		'seedPast5',
		'pastproject5',
		'maker3@example.com',
		['Program 2'],
		'Description of past project 5.',
		43200,
		120
	],
	[
		'seedShipHeld',
		'seedPast6',
		'pastproject6',
		'maker4@example.com',
		['Program 3'],
		'Description of past project 6.',
		27000,
		75
	]
];

// both tables belong to ari-webhooks: they exist once that service has run against the database
async function seedServiceTables(db: PrismaClient) {
	const [{ present }] = await db.$queryRaw<{ present: boolean }[]>`
		select to_regclass('ariw."submissionFileHours"') is not null
		   and to_regclass('ariw."submissionPastProjects"') is not null as present`;
	if (!present) {
		console.log(
			'No ariw schema: per-file time and past projects were not seeded. The tables exist once ari-webhooks has run against this database.'
		);
		return;
	}
	for (const [submissionId, path, seconds, bytes, status] of fileHours) {
		await db.$executeRaw`
			insert into ariw."submissionFileHours" ("submissionId", path, seconds, bytes, status)
			values (${submissionId}, ${path}, ${seconds}, ${bytes}, ${status})`;
	}
	for (const [
		submissionId,
		recordId,
		name,
		email,
		programs,
		description,
		seconds,
		days,
		screenshotUrl
	] of pastProjects) {
		await db.$executeRaw`
			insert into ariw."submissionPastProjects"
				("submissionId", "recordId", "recordUrl", email, programs, "codeUrl", "playableUrl",
				 description, "screenshotUrl", "hackatimeProjects", "creditedHours", "creditedSeconds",
				 "approvedAt")
			values (${submissionId}, ${recordId}, ${`https://example.com/ledger/${recordId}`}, ${email},
				${programs}, ${`https://example.com/${name}`}, ${`https://example.com/${name}/demo`},
				${description}, ${screenshotUrl ?? ''}, ${[name]}, ${seconds}::float8 / 3600, ${seconds},
				${days === null ? null : daysAgo(days)})`;
	}
}

export async function seedReviewPage(db: PrismaClient) {
	await seedDrafts(db);
	await seedServiceTables(db);
}
