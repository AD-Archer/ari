import type { Track } from '../../generated/prisma/client';

export type SeedDecision = 'approved' | 'changes' | 'rejected';

export interface SeedReview {
	reviewerId: string;
	decision: SeedDecision;
	daysAgo: number;
	hourOfDay?: number;
	noteToMaker: string;
	auditNote: string;
	deflateSeconds?: number;
	// recorded the way old ari did, minutes only: 1 credits commits, 2 credits tracked time
	legacyVersion?: 1 | 2;
	// version 1 only: credited minutes by commit position, and for the time after the last commit
	commitMinutes?: Record<number, number>;
	afterMinutes?: number;
	technicalFeatures?: string;
	deflationReason?: string;
	// recorded when reviews still asked for the four extra texts: the number goes in each of them
	earlierFlow?: number;
	checklist?: boolean[];
	fieldValues?: Record<string, string | boolean | string[]>;
}

export interface SeedShip {
	id: string;
	programId: string;
	// ships of one project share it. defaults to a value unique to the ship
	externalId?: string;
	version?: number;
	title: string;
	description: string;
	track: Track;
	makerId: string;
	collaboratorIds?: string[];
	queuedDaysAgo: number;
	queuedHour?: number;
	status?:
		| 'pending'
		| 'secondpass'
		| 'approved'
		| 'changes'
		| 'rejected'
		| 'reverted'
		| 'withdrawn';
	priority?: boolean;
	updateMessage?: string;
	thumbnailUrl?: string;
	review?: SeedReview;
	commits: { message: string; codingSeconds: number; additions: number; deletions: number }[];
	devlogs: { text: string; seconds: number }[];
	clips: { note: string; lengthSeconds: number; url?: string; thumbnailUrl?: string }[];
	programSeconds?: number;
	afterLastCommitSeconds?: number;
	// a degraded capture: the tracked time was never written, the commits kept their coding time
	trackedLost?: boolean;
}

// a tiny generated recording under static/dev, so a clip plays without leaving the machine
export const sampleClip = { url: '/dev/sampleClip.webm', thumbnailUrl: '/flag-hand.png' };

// "Project 12" names its repository, demo and hackatime project "project12"
export const projectSlug = (title: string) => title.toLowerCase().replace(' ', '');

// repeated 8 times: an approval's audit note needs 100 characters (reviewRules.ts)
export const notesFor = (number: number) => ({
	noteToMaker: `note to maker ${number}.`,
	auditNote: `audit note ${number}. `.repeat(8).trimEnd()
});

const software = 'seedProgramSoftware';
const hardware = 'seedProgramHardware';

export const detailedShips: SeedShip[] = [
	{
		id: 'seedShipWeather',
		programId: software,
		title: 'Project 1',
		thumbnailUrl: '/flag.png',
		description: 'Description of project 1.',
		track: 'software',
		makerId: 'seedMakerRiley',
		queuedDaysAgo: 3,
		commits: [
			{
				message: 'commit 1',
				codingSeconds: 2537, // 42m 17s: 42 * 60 + 17
				additions: 310,
				deletions: 0
			},
			{
				message: 'commit 2',
				codingSeconds: 4360, // 1h 12m 40s: 3600 + 12 * 60 + 40
				additions: 220,
				deletions: 14
			},
			{
				message: 'commit 3',
				codingSeconds: 7389, // 2h 3m 9s: 2 * 3600 + 3 * 60 + 9
				additions: 180,
				deletions: 32
			},
			{
				message: 'commit 4',
				codingSeconds: 2271, // 37m 51s: 37 * 60 + 51
				additions: 96,
				deletions: 21
			}
		],
		devlogs: [
			{ text: 'journal entry 1.', seconds: 2700 }, // 45m: 45 * 60
			{ text: 'journal entry 2.', seconds: 1800 } // 30m: 30 * 60
		],
		clips: []
	},
	{
		id: 'seedShipChess',
		programId: software,
		title: 'Project 2',
		thumbnailUrl: '/flag.png',
		description: 'Description of project 2.',
		track: 'software',
		makerId: 'seedMakerNoor',
		collaboratorIds: ['seedMakerNoor', 'seedMakerTomas'],
		queuedDaysAgo: 2,
		commits: [
			{
				message: 'commit 1',
				codingSeconds: 11645, // 3h 14m 5s: 3 * 3600 + 14 * 60 + 5
				additions: 640,
				deletions: 12
			},
			{
				message: 'commit 2',
				codingSeconds: 9633, // 2h 40m 33s: 2 * 3600 + 40 * 60 + 33
				additions: 410,
				deletions: 55
			},
			{
				message: 'commit 3',
				codingSeconds: 4968, // 1h 22m 48s: 3600 + 22 * 60 + 48
				additions: 205,
				deletions: 40
			}
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 3600 }], // 1h: 60 * 60
		clips: [{ note: 'clip 1', lengthSeconds: 3912, ...sampleClip }], // 1h 5m 12s: 3600 + 5 * 60 + 12
		programSeconds: 7200 // 2h: 2 * 3600
	},
	{
		id: 'seedShipHeld',
		programId: software,
		title: 'Project 3',
		thumbnailUrl: '/flag.png',
		description: 'Description of project 3.',
		track: 'software',
		makerId: 'seedMakerIris',
		queuedDaysAgo: 6,
		status: 'secondpass',
		review: {
			reviewerId: 'seedUserSoftware',
			decision: 'approved',
			daysAgo: 0,
			hourOfDay: 1,
			...notesFor(3),
			technicalFeatures: 'technical features 3.',
			deflationReason: 'deflation reason 3.',
			deflateSeconds: 1803 // 30m 3s: 30 * 60 + 3
		},
		commits: [
			{
				message: 'commit 1',
				codingSeconds: 7707, // 2h 8m 27s: 2 * 3600 + 8 * 60 + 27
				additions: 380,
				deletions: 8
			},
			{ message: 'commit 2', codingSeconds: 3483, additions: 150, deletions: 22 } // 58m 3s: 58 * 60 + 3
		],
		devlogs: [],
		clips: []
	},
	{
		id: 'seedShipKeyboard',
		programId: hardware,
		title: 'Project 4',
		thumbnailUrl: '/flag.png',
		description: 'Description of project 4.',
		track: 'hardware',
		makerId: 'seedMakerTomas',
		queuedDaysAgo: 4,
		commits: [
			{
				message: 'commit 1',
				codingSeconds: 5504, // 1h 31m 44s: 3600 + 31 * 60 + 44
				additions: 2,
				deletions: 0
			},
			{
				message: 'commit 2',
				codingSeconds: 14539, // 4h 2m 19s: 4 * 3600 + 2 * 60 + 19
				additions: 5,
				deletions: 1
			},
			{ message: 'commit 3', codingSeconds: 3126, additions: 140, deletions: 0 } // 52m 6s: 52 * 60 + 6
		],
		devlogs: [
			{ text: 'journal entry 1.', seconds: 8100 }, // 2h 15m: 2 * 3600 + 15 * 60
			{ text: 'journal entry 2.', seconds: 4200 } // 1h 10m: 3600 + 10 * 60
		],
		clips: [{ note: 'clip 1', lengthSeconds: 2850 }] // 47m 30s: 47 * 60 + 30
	},
	{
		id: 'seedShipUpdatePrior',
		programId: software,
		externalId: 'external-seedProjectUpdate',
		title: 'Project 5',
		description: 'Description of project 5.',
		track: 'software',
		makerId: 'seedMakerMaya',
		queuedDaysAgo: 12,
		status: 'changes',
		review: {
			reviewerId: 'seedUserSoftware',
			decision: 'changes',
			daysAgo: 10,
			...notesFor(5)
		},
		commits: [
			{ message: 'commit 1', codingSeconds: 5021, additions: 300, deletions: 4 } // 1h 23m 41s: 3600 + 23 * 60 + 41
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 1500 }], // 25m: 25 * 60
		clips: []
	},
	{
		id: 'seedShipUpdate',
		programId: software,
		externalId: 'external-seedProjectUpdate',
		version: 2,
		title: 'Project 6',
		description: 'Description of project 6.',
		track: 'software',
		makerId: 'seedMakerMaya',
		queuedDaysAgo: 1,
		updateMessage: 'update message 1.',
		commits: [
			{ message: 'commit 1', codingSeconds: 5021, additions: 300, deletions: 4 }, // 1h 23m 41s: 3600 + 23 * 60 + 41
			{ message: 'commit 2', codingSeconds: 3187, additions: 160, deletions: 12 } // 53m 7s: 53 * 60 + 7
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 2100 }], // 35m: 35 * 60
		clips: []
	},
	{
		id: 'seedShipHeldLegacy',
		programId: software,
		title: 'Project 7',
		description: 'Description of project 7.',
		track: 'software',
		makerId: 'seedMakerJun',
		queuedDaysAgo: 5,
		status: 'secondpass',
		review: {
			reviewerId: 'seedUserSoftware',
			decision: 'approved',
			daysAgo: 1,
			...notesFor(7),
			deflateSeconds: 900, // 15m: 15 * 60
			legacyVersion: 2
		},
		commits: [
			{ message: 'commit 1', codingSeconds: 6130, additions: 420, deletions: 9 }, // 1h 42m 10s: 3600 + 42 * 60 + 10
			{ message: 'commit 2', codingSeconds: 2954, additions: 210, deletions: 30 } // 49m 14s: 49 * 60 + 14
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 1800 }], // 30m: 30 * 60
		clips: []
	}
];
