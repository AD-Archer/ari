import type { Track } from '../../generated/prisma/client';
import { scenarioShips } from './scenarioShips';
import {
	detailedShips,
	notesFor,
	type SeedDecision,
	type SeedReview,
	type SeedShip
} from './ships';

const software = 'seedProgramSoftware';
const hardware = 'seedProgramHardware';

// evidence varies with the ship's position so lists show a spread of totals, none of them round
function evidenceFor(position: number): Pick<SeedShip, 'commits' | 'devlogs' | 'clips'> {
	const commitCount = 2 + (position % 4);
	return {
		commits: Array.from({ length: commitCount }, (_unused, index) => ({
			message: `commit ${index + 1}`,
			codingSeconds: 1500 + ((position * 977 + index * 2311) % 6100), // 25m to about 2h 6m
			additions: 40 + ((position * 37 + index * 113) % 520),
			deletions: (position * 11 + index * 29) % 60
		})),
		devlogs: Array.from({ length: position % 3 }, (_unused, index) => ({
			text: `journal entry ${index + 1}.`,
			seconds: 1200 + ((position * 613 + index * 409) % 3000) // 20m to about 70m
		})),
		clips:
			position % 5 === 0
				? [{ note: 'clip 1', lengthSeconds: 1700 + ((position * 271) % 2400) }] // 28m to about 68m
				: []
	};
}

type ReviewOutline = Omit<SeedReview, 'noteToMaker' | 'auditNote'>;
type Extra = Partial<
	Pick<SeedShip, 'queuedHour' | 'priority' | 'updateMessage' | 'collaboratorIds' | 'thumbnailUrl'>
> & { review?: ReviewOutline };
let position = 0;

function ship(
	id: string,
	programId: string,
	track: Track,
	maker: string,
	queuedDaysAgo: number,
	status: SeedShip['status'],
	extra: Extra = {}
): SeedShip {
	position += 1;
	// 9 ships come before these: the detailed and scenario ones
	const number = position + 9;
	return {
		id: `seedShip${id}`,
		programId,
		track,
		makerId: `seedMaker${maker}`,
		title: `Project ${number}`,
		description: `Description of project ${number}.`,
		queuedDaysAgo,
		status,
		...extra,
		review: extra.review && { ...extra.review, ...notesFor(number) },
		...evidenceFor(position)
	};
}

const pending = (
	id: string,
	programId: string,
	track: Track,
	maker: string,
	queuedDaysAgo: number,
	extra: Extra = {}
) => ship(`Pending${id}`, programId, track, maker, queuedDaysAgo, 'pending', extra);

const reviewOf = (
	reviewer: string,
	decision: SeedDecision,
	daysAgo: number,
	hourOfDay: number
): ReviewOutline => ({ reviewerId: `seedUser${reviewer}`, decision, daysAgo, hourOfDay });

// the app's own static asset, so nothing is fetched from outside
const thumbnailUrl = '/flag.png';

const pendingShips: SeedShip[] = [
	pending('01', software, 'software', 'Jun', 20, {
		thumbnailUrl
	}),
	pending('02', software, 'software', 'Maya', 19, { queuedHour: 9 }),
	pending('03', software, 'hardware', 'Omar', 18),
	pending('04', software, 'software', 'Priya', 17, {
		priority: true
	}),
	pending('05', software, 'software', 'Luca', 16, {
		queuedHour: 21
	}),
	pending('06', software, 'software', 'Zoe', 15),
	pending('07', software, 'hardware', 'Tomas', 14, {
		queuedHour: 11
	}),
	pending('08', software, 'software', 'Riley', 13, {
		updateMessage: 'update message 2.'
	}),
	pending('09', software, 'software', 'Noor', 12, {
		collaboratorIds: ['seedMakerNoor', 'seedMakerJun']
	}),
	pending('10', software, 'software', 'Iris', 11, { queuedHour: 8 }),
	pending('11', software, 'software', 'Maya', 10, {
		priority: true
	}),
	pending('12', software, 'hardware', 'Omar', 9),
	pending('13', software, 'software', 'Priya', 8, { queuedHour: 19 }),
	pending('14', software, 'software', 'Luca', 7, {
		updateMessage: 'update message 3.'
	}),
	pending('15', software, 'software', 'Zoe', 6),
	pending('16', software, 'software', 'Jun', 5, {
		queuedHour: 13
	}),
	pending('17', software, 'software', 'Riley', 4),
	pending('18', software, 'hardware', 'Tomas', 3, { queuedHour: 10 }),
	pending('19', software, 'software', 'Iris', 1),
	pending('20', software, 'software', 'Maya', 0, { queuedHour: 2 }),
	pending('21', hardware, 'hardware', 'Omar', 19, { thumbnailUrl }),
	pending('22', hardware, 'hardware', 'Priya', 16, { priority: true }),
	pending('23', hardware, 'software', 'Luca', 14, { queuedHour: 17 }),
	pending('24', hardware, 'hardware', 'Zoe', 12, {
		collaboratorIds: ['seedMakerZoe', 'seedMakerOmar']
	}),
	pending('25', hardware, 'hardware', 'Jun', 10, {
		updateMessage: 'update message 4.'
	}),
	pending('26', hardware, 'hardware', 'Tomas', 8, { queuedHour: 12 }),
	pending('27', hardware, 'software', 'Riley', 6),
	pending('28', hardware, 'hardware', 'Noor', 5),
	pending('29', hardware, 'hardware', 'Iris', 2, {
		queuedHour: 20
	}),
	pending('30', hardware, 'hardware', 'Maya', 0, { queuedHour: 3 }),
	pending('31', hardware, 'hardware', 'Hana', 7, { thumbnailUrl }),
	pending('32', hardware, 'hardware', 'Omar', 3, {
		collaboratorIds: ['seedMakerOmar', 'seedMakerHana']
	})
];

const decided = (
	id: string,
	programId: string,
	track: Track,
	maker: string,
	queuedDaysAgo: number,
	status: SeedShip['status'],
	review?: ReviewOutline
) =>
	ship(`Decided${id}`, programId, track, maker, queuedDaysAgo, status, {
		review,
		// every fourth decided ship gets a thumbnail
		...(Number(id) % 4 === 1 ? { thumbnailUrl } : {})
	});

const decidedShips: SeedShip[] = [
	decided(
		'01',
		software,
		'software',
		'Jun',
		24,
		'approved',
		reviewOf('Software', 'approved', 21, 14)
	),
	decided('02', software, 'software', 'Maya', 22, 'approved', reviewOf('Lead', 'approved', 18, 16)),
	decided(
		'03',
		software,
		'software',
		'Priya',
		20,
		'changes',
		reviewOf('Software', 'changes', 15, 11)
	),
	decided('04', software, 'software', 'Luca', 19, 'rejected', reviewOf('Poc', 'rejected', 13, 17)),
	decided('05', software, 'hardware', 'Omar', 17, 'approved', reviewOf('Poc', 'approved', 11, 10)),
	decided(
		'06',
		software,
		'software',
		'Zoe',
		15,
		'approved',
		reviewOf('Software', 'approved', 9, 15)
	),
	decided('07', software, 'software', 'Riley', 12, 'reverted', reviewOf('Lead', 'approved', 8, 12)),
	decided('08', software, 'software', 'Noor', 11, 'withdrawn'),
	decided('09', software, 'software', 'Iris', 9, 'approved', {
		...reviewOf('Software', 'approved', 5, 13),
		legacyVersion: 2
	}),
	decided('10', software, 'software', 'Maya', 8, 'changes', reviewOf('Lead', 'changes', 4, 18)),
	decided('11', software, 'software', 'Jun', 6, 'approved', reviewOf('Software', 'approved', 2, 9)),
	decided(
		'12',
		software,
		'software',
		'Priya',
		5,
		'approved',
		reviewOf('Software', 'approved', 1, 14)
	),
	decided(
		'13',
		software,
		'software',
		'Luca',
		4,
		'rejected',
		reviewOf('Software', 'rejected', 1, 16)
	),
	decided('14', software, 'software', 'Zoe', 3, 'approved', reviewOf('Lead', 'approved', 0, 1)),
	decided('15', hardware, 'hardware', 'Tomas', 21, 'approved', {
		...reviewOf('Hardware', 'approved', 17, 15),
		technicalFeatures: 'technical features 1.',
		earlierFlow: 1
	}),
	decided(
		'16',
		hardware,
		'hardware',
		'Omar',
		14,
		'changes',
		reviewOf('Hardware', 'changes', 10, 12)
	),
	decided('17', hardware, 'hardware', 'Noor', 9, 'approved', reviewOf('Poc', 'approved', 6, 11)),
	decided(
		'18',
		hardware,
		'hardware',
		'Zoe',
		7,
		'rejected',
		reviewOf('Hardware', 'rejected', 3, 16)
	),
	decided('19', hardware, 'hardware', 'Jun', 4, 'approved', reviewOf('Hardware', 'approved', 0, 2))
];

const heldShips: SeedShip[] = [
	ship('HeldChanges', software, 'software', 'Luca', 5, 'secondpass', {
		review: reviewOf('Software', 'changes', 1, 10)
	}),
	ship('HeldRejected', software, 'software', 'Priya', 4, 'secondpass', {
		review: reviewOf('Lead', 'rejected', 0, 2)
	}),
	ship('HeldHardware', software, 'hardware', 'Noor', 3, 'secondpass', {
		review: {
			...reviewOf('Lead', 'approved', 1, 9),
			technicalFeatures: 'technical features 2.',
			earlierFlow: 2
		}
	})
];

export const seedShips: SeedShip[] = [
	...detailedShips,
	...scenarioShips,
	...pendingShips,
	...decidedShips,
	...heldShips
];
