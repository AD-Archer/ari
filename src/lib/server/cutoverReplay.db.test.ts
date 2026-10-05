import { expect, test } from 'bun:test';
import { PrismaClient } from '$db';
import { PrismaPg } from '@prisma/adapter-pg';
import { settle } from '$lib/review/settlement';
import { settleHours } from '$lib/server/settlementLegacy';
import { evidenceFromRows } from '$lib/server/settlementStore';
import { minutesToSeconds, toLegacyMinutes } from '$lib/time';

// never DATABASE_URL: this inspects a restored production copy, through a read-only session
const cutoverUrl = process.env.CUTOVER_DATABASE_URL;

interface ReviewRow {
	id: string;
	submissionId: string;
	createdAt: Date;
	settlementVersion: number;
	approvedMinutes: number;
	adjustments: unknown;
	collaboratorMinutes: unknown;
	deflateMinutes: number | null;
	collaboratorDeflates: unknown;
	approvedSeconds?: number;
	adjustmentsSeconds?: unknown;
	collaboratorSeconds?: unknown;
	deflateSeconds?: number | null;
	collaboratorDeflatesSeconds?: unknown;
	evidenceSyncedAt: Date | null;
}

interface EvidenceRow {
	submissionId: string;
	id: string;
	makerId: string | null;
	codingSeconds: number;
	lengthSeconds: number;
	minutes: number;
	seconds: number;
	hackatimeMinutes: number;
	afterLastCommitMinutes: number;
	programMinutes: number;
	hackatimeSeconds: number;
	afterLastCommitSeconds: number;
	programSeconds: number;
}

interface Mismatch {
	reviewId: string;
	submissionId: string;
	settlementVersion: number;
	field: string;
	stored: unknown;
	expected: unknown;
	// true when the ship's evidence was captured again after this decision
	evidenceCapturedLater: boolean;
}

// postgres does not keep json key order, so objects are compared with their keys sorted
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1));
		return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
	}
	return JSON.stringify(value ?? null);
}

function timesSixty(value: unknown): unknown {
	if (typeof value === 'number') return minutesToSeconds(value);
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, timesSixty(inner)])
		);
	}
	return value;
}

const isObject = (value: unknown) =>
	Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function bySubmission(rows: EvidenceRow[]): Map<string, EvidenceRow[]> {
	const grouped = new Map<string, EvidenceRow[]>();
	for (const row of rows) {
		const list = grouped.get(row.submissionId);
		if (list) list.push(row);
		else grouped.set(row.submissionId, [row]);
	}
	return grouped;
}

test.skipIf(!cutoverUrl)(
	'every stored review replays to its stored settlement',
	async () => {
		const client = new PrismaClient({
			adapter: new PrismaPg({
				connectionString: cutoverUrl,
				options: '-c default_transaction_read_only=on'
			})
		});
		const read = <Row>(sql: string) => client.$queryRawUnsafe<Row[]>(sql);

		try {
			const secondsColumns = await read<{ present: boolean }>(
				`select exists (select 1 from information_schema.columns
				 where table_schema = 'public' and table_name = 'Review' and column_name = 'approvedSeconds') as present`
			);
			const migrated = secondsColumns[0].present;
			const reviewed = `"submissionId" in (select "submissionId" from "Review")`;
			const seconds = (column: string) => (migrated ? `"${column}"` : `0 as "${column}"`);

			const reviews = await read<ReviewRow>(
				`select review.id, review."submissionId", review."createdAt", review."settlementVersion",
				 review."approvedMinutes", review.adjustments, review."collaboratorMinutes",
				 review."deflateMinutes", review."collaboratorDeflates", submission."evidenceSyncedAt"
				 ${migrated ? `, review."approvedSeconds", review."adjustmentsSeconds", review."collaboratorSeconds", review."deflateSeconds", review."collaboratorDeflatesSeconds"` : ''}
				 from "Review" review join "Submission" submission on submission.id = review."submissionId"
				 order by review."createdAt", review.id`
			);
			const [commits, devlogs, clips, hours, people] = await Promise.all([
				read<EvidenceRow>(
					`select "submissionId", id, "makerId", "codingSeconds" from "Commit" where ${reviewed}`
				),
				read<EvidenceRow>(
					`select "submissionId", id, "makerId", minutes, ${seconds('seconds')} from "Devlog" where ${reviewed}`
				),
				read<EvidenceRow>(
					`select "submissionId", id, "makerId", "lengthSeconds" from "ElapsedClip" where ${reviewed}`
				),
				read<EvidenceRow>(
					`select "submissionId", "hackatimeMinutes", "afterLastCommitMinutes", "programMinutes",
					 ${seconds('hackatimeSeconds')}, ${seconds('afterLastCommitSeconds')}, ${seconds('programSeconds')}
					 from "HoursBreakdown" where ${reviewed}`
				),
				read<EvidenceRow>(
					`select "submissionId", "makerId", "hackatimeMinutes", "afterLastCommitMinutes", "programMinutes",
					 ${seconds('hackatimeSeconds')}, ${seconds('afterLastCommitSeconds')}, ${seconds('programSeconds')}
					 from "SubmissionCollaborator" where ${reviewed} order by id`
				)
			]);
			const commitsFor = bySubmission(commits);
			const devlogsFor = bySubmission(devlogs);
			const clipsFor = bySubmission(clips);
			const hoursFor = bySubmission(hours);
			const peopleFor = bySubmission(people);

			const mismatches: Mismatch[] = [];
			const counts: Record<string, number> = {};
			for (const review of reviews) {
				counts[review.settlementVersion] = (counts[review.settlementVersion] ?? 0) + 1;
				const differs = (field: string, stored: unknown, expected: unknown) => {
					if (canonical(stored) === canonical(expected)) return;
					mismatches.push({
						reviewId: review.id,
						submissionId: review.submissionId,
						settlementVersion: review.settlementVersion,
						field,
						stored,
						expected,
						evidenceCapturedLater:
							review.evidenceSyncedAt !== null && review.evidenceSyncedAt > review.createdAt
					});
				};
				// the same rows a resend reads: the evidence as it is now, not as it was at the decision
				const rows = {
					commits: commitsFor.get(review.submissionId) ?? [],
					devlogs: devlogsFor.get(review.submissionId) ?? [],
					clips: clipsFor.get(review.submissionId) ?? [],
					hours: hoursFor.get(review.submissionId)?.[0] ?? null,
					collaborators: (peopleFor.get(review.submissionId) ?? []).map((person) => ({
						...person,
						makerId: person.makerId ?? ''
					}))
				};

				if (review.settlementVersion === 3) {
					const replayed = settle(review.adjustmentsSeconds, evidenceFromRows(rows));
					differs('approvedSeconds', review.approvedSeconds, replayed.approvedSeconds);
					differs('collaboratorSeconds', review.collaboratorSeconds, replayed.collaborators);
					differs(
						'approvedMinutes',
						review.approvedMinutes,
						toLegacyMinutes(replayed.approvedSeconds)
					);
					continue;
				}

				const replayed = settleHours(
					review.adjustments,
					rows,
					review.settlementVersion === 2 ? 2 : 1
				);
				differs('approvedMinutes', review.approvedMinutes, replayed.approvedMinutes);
				differs('collaboratorMinutes', review.collaboratorMinutes, replayed.collaborators);
				if (!migrated) continue;

				differs(
					'approvedSeconds',
					review.approvedSeconds,
					minutesToSeconds(review.approvedMinutes)
				);
				differs(
					'deflateSeconds',
					review.deflateSeconds,
					review.deflateMinutes === null ? null : minutesToSeconds(review.deflateMinutes)
				);
				differs(
					'collaboratorSeconds',
					review.collaboratorSeconds,
					isObject(review.collaboratorMinutes) ? timesSixty(review.collaboratorMinutes) : {}
				);
				differs(
					'collaboratorDeflatesSeconds',
					review.collaboratorDeflatesSeconds,
					isObject(review.collaboratorDeflates) ? timesSixty(review.collaboratorDeflates) : null
				);
			}

			console.log(
				`[cutoverReplay] ${migrated ? 'migrated' : 'not yet migrated'} database: ${reviews.length} reviews by settlement version ${JSON.stringify(counts)}, ${mismatches.length} differences in ${new Set(mismatches.map((mismatch) => mismatch.reviewId)).size} reviews`
			);
			expect(mismatches).toEqual([]);
		} finally {
			await client.$disconnect();
		}
	},
	600000 // 10 minutes for a production-sized copy: 10 * 60 * 1000
);
