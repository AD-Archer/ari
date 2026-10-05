import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { settle } from '../../src/lib/review/settlement';
import { settleHours } from '../../src/lib/server/settlementLegacy';
import { evidenceFromRows, reviewColumns } from '../../src/lib/server/settlementStore';
import { minutesToSeconds, toLegacyMinutes } from '../../src/lib/time';
import { recentOrDaysAgo } from './shared';
import type { SeedReview, SeedShip } from './ships';

type LegacyRows = Parameters<typeof settleHours>[1];

// a review as old ari recorded it: replayed from the minute columns under its own version
function legacyReviewColumns(rows: LegacyRows, review: SeedReview) {
	const requested: Record<string, Record<string, number>> = {};
	if (review.legacyVersion === 1) {
		requested.commits = Object.fromEntries(
			Object.entries(review.commitMinutes ?? {}).map(([position, minutes]) => [
				rows.commits[Number(position)].id,
				minutes
			])
		);
		if (review.afterMinutes !== undefined) requested.after = { after: review.afterMinutes };
	}
	const settled = settleHours(requested, rows, review.legacyVersion ?? 2);
	return {
		settlementVersion: review.legacyVersion ?? 2,
		approvedMinutes: settled.approvedMinutes,
		adjustments: settled.adjustments as Prisma.InputJsonObject,
		collaboratorMinutes: settled.collaborators,
		deflateMinutes: review.deflateSeconds ? toLegacyMinutes(review.deflateSeconds) : null,
		approvedSeconds: minutesToSeconds(settled.approvedMinutes)
	};
}

const workbenchAnswers = {
	field1: 'Option 2',
	field2: true,
	field3: 'answer 1.',
	field4: '42',
	field5: ['Option 4', 'Option 5']
};

// an approval ticked every item its track has: three for program 1 software, two for
// program 2 hardware, none elsewhere
function defaultChecklist(ship: SeedShip, review: SeedReview): boolean[] {
	if (review.decision !== 'approved') return [];
	if (ship.programId === 'seedProgramSoftware' && ship.track === 'software')
		return [true, true, true];
	if (ship.programId === 'seedProgramHardware' && ship.track === 'hardware') return [true, true];
	return [];
}

export async function seedReview(db: PrismaClient, ship: SeedShip): Promise<number> {
	const review = ship.review;
	if (!review) return 0;
	const rows = await db.submission.findUniqueOrThrow({
		where: { id: ship.id },
		include: {
			commits: { orderBy: { committedAt: 'asc' } },
			devlogs: true,
			clips: true,
			hours: true,
			collaborators: true
		}
	});
	const columns = review.legacyVersion
		? legacyReviewColumns(rows, review)
		: reviewColumns(settle({}, evidenceFromRows(rows)), { deflateSeconds: review.deflateSeconds });
	const answersWorkbench =
		ship.programId === 'seedProgramHardware' &&
		ship.track === 'hardware' &&
		review.decision === 'approved';
	await db.review.create({
		data: {
			id: `seedReview${ship.id.slice(8)}`, // 8: drops the "seedShip" prefix
			submissionId: ship.id,
			reviewerId: review.reviewerId,
			decision: review.decision,
			noteToMaker: review.noteToMaker,
			auditNote: review.auditNote,
			technicalFeatures: review.technicalFeatures ?? '',
			deflationReason: review.deflationReason ?? '',
			...(review.earlierFlow
				? {
						timeEvidence: `time evidence ${review.earlierFlow}.`,
						supportingEvidence: `supporting evidence ${review.earlierFlow}.`,
						hoursReasoning: `hours reasoning ${review.earlierFlow}.`,
						additionalJustification: `additional justification ${review.earlierFlow}.`
					}
				: {}),
			fieldValues: review.fieldValues ?? (answersWorkbench ? workbenchAnswers : {}),
			checklist: review.checklist ?? defaultChecklist(ship, review),
			createdAt: recentOrDaysAgo(review.daysAgo, review.hourOfDay),
			...columns
		}
	});
	return columns.approvedSeconds;
}
