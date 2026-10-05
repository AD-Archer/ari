import { notesFor, sampleClip, type SeedShip } from './ships';

// ships the review screen needs that the generated spread does not produce
export const scenarioShips: SeedShip[] = [
	{
		id: 'seedShipDegraded',
		programId: 'seedProgramSoftware',
		title: 'Project 8',
		description: 'Description of project 8.',
		track: 'software',
		makerId: 'seedMakerZoe',
		queuedDaysAgo: 2,
		queuedHour: 11,
		trackedLost: true,
		afterLastCommitSeconds: 1265, // 21m 5s: 21 * 60 + 5
		commits: [
			{ message: 'commit 1', codingSeconds: 3127, additions: 280, deletions: 3 }, // 52m 7s: 52 * 60 + 7
			{ message: 'commit 2', codingSeconds: 0, additions: 0, deletions: 0 },
			{ message: 'commit 3', codingSeconds: 0, additions: 1, deletions: 1 },
			{ message: 'commit 4', codingSeconds: 0, additions: 12, deletions: 12 },
			{ message: 'commit 5', codingSeconds: 0, additions: 44, deletions: 44 },
			{ message: 'commit 6', codingSeconds: 2475, additions: 190, deletions: 21 }, // 41m 15s: 41 * 60 + 15
			{ message: 'commit 7', codingSeconds: 0, additions: 1, deletions: 1 },
			{ message: 'commit 8', codingSeconds: 1812, additions: 120, deletions: 38 } // 30m 12s: 30 * 60 + 12
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 1500 }], // 25m: 25 * 60
		clips: [{ note: 'clip 1', lengthSeconds: 660, ...sampleClip }] // 11m: 11 * 60
	},
	{
		id: 'seedShipDecidedV1',
		programId: 'seedProgramSoftware',
		title: 'Project 9',
		description: 'Description of project 9.',
		track: 'software',
		makerId: 'seedMakerRiley',
		queuedDaysAgo: 60,
		status: 'approved',
		afterLastCommitSeconds: 1500, // 25m: 25 * 60
		review: {
			reviewerId: 'seedUserLead',
			decision: 'approved',
			daysAgo: 55,
			...notesFor(9),
			legacyVersion: 1,
			// 40m of the 1h 10m commit, none of the 20m one
			commitMinutes: { 1: 40, 2: 0 },
			afterMinutes: 10,
			checklist: [true, true, true]
		},
		commits: [
			{ message: 'commit 1', codingSeconds: 3000, additions: 240, deletions: 0 }, // 50m: 50 * 60
			{ message: 'commit 2', codingSeconds: 4200, additions: 310, deletions: 18 }, // 1h 10m: 70 * 60
			{ message: 'commit 3', codingSeconds: 1200, additions: 900, deletions: 0 }, // 20m: 20 * 60
			{ message: 'commit 4', codingSeconds: 2400, additions: 130, deletions: 9 } // 40m: 40 * 60
		],
		devlogs: [{ text: 'journal entry 1.', seconds: 1800 }], // 30m: 30 * 60
		clips: []
	}
];
