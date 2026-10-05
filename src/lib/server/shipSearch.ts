import { Prisma } from '$db';
import { db } from '$lib/server/db';

export interface ShipCandidate {
	id: string;
	// the whole query sits in one of the people on the ship: an email, a name, a slack or hackatime id
	byPerson: boolean;
	// every word is on the ship as typed, none of them only close to something
	exact: boolean;
}

// a pasted link carries a scheme, a trailing slash or .git that the stored url may not
const normalize = (word: string) =>
	word
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.replace(/\.git$/i, '');

export const searchWords = (query: string): string[] =>
	query
		.split(/\s+/)
		.map(normalize)
		.filter((word) => word.length > 0)
		.slice(0, 6); // 6: more words than that is a sentence, and each one is a scan

const likePattern = (word: string) => `%${word.replace(/[\\%_]/g, '\\$&')}%`;

// every word has to be found somewhere on the ship, written out or close to it. the order is
// how well the words fit, then the newest ship. access rules are the caller's to apply
export async function searchShipCandidates(
	programId: string,
	query: string
): Promise<ShipCandidate[]> {
	const words = searchWords(query);
	if (words.length === 0) return [];
	const whole = likePattern(normalize(query.trim()));

	const fits = words.map((word) => {
		const written = Prisma.sql`ships.everything ILIKE ${likePattern(word)}`;
		// 3: a shorter word shares trigrams with nearly anything, so it has to be written out
		if (word.length < 3) return { written, matches: written, score: Prisma.sql`1` };
		const closeness = Prisma.sql`word_similarity(${word}, ships.everything)`;
		return {
			written,
			// 0.5: a typo or two in a word still finds it, an unrelated word does not
			matches: Prisma.sql`(${written} OR ${closeness} >= 0.5)`,
			score: Prisma.sql`GREATEST(CASE WHEN ${written} THEN 1 ELSE 0 END, ${closeness})`
		};
	});

	return db.$queryRaw<ShipCandidate[]>`
		WITH people AS (
			SELECT submission.id AS "submissionId", maker.*
			FROM "Submission" submission
			JOIN "Maker" maker ON maker.id = submission."makerId"
			WHERE submission."programId" = ${programId}
			UNION ALL
			SELECT submission.id, maker.*
			FROM "Submission" submission
			JOIN "SubmissionCollaborator" collaborator ON collaborator."submissionId" = submission.id
			JOIN "Maker" maker ON maker.id = collaborator."makerId"
			WHERE submission."programId" = ${programId}
		), named AS (
			SELECT "submissionId",
				string_agg(concat_ws(' ', email, name, "slackId", "hackatimeUserId"), ' ') AS person
			FROM people
			GROUP BY "submissionId"
		), ships AS (
			SELECT submission.id, submission."receivedAt",
				concat_ws(' ', named.person, submission."authorNameOverrides"::text) AS person,
				concat_ws(' ', submission.title, submission.id, submission."repoUrl",
					submission."demoUrl", named.person, submission."authorNameOverrides"::text) AS everything
			FROM "Submission" submission
			LEFT JOIN named ON named."submissionId" = submission.id
			WHERE submission."programId" = ${programId}
		)
		SELECT ships.id, ships.person ILIKE ${whole} AS "byPerson",
			(${Prisma.join(
				fits.map((fit) => fit.written),
				' AND '
			)}) AS exact
		FROM ships
		WHERE ${Prisma.join(
			fits.map((fit) => fit.matches),
			' AND '
		)}
		ORDER BY ${Prisma.join(
			fits.map((fit) => fit.score),
			' + '
		)} DESC, ships."receivedAt" DESC
		LIMIT 200
	`; // 200: every ship of one person in a program, with room for the access rules to drop some
}

// what to show beside a hit so it is clear why it matched: the link or the person the words hit
export function matchedDetail(
	query: string,
	ship: {
		repoUrl: string;
		demoUrl: string | null;
		people: { email: string; slackId: string | null; hackatimeUserId: string | null }[];
	}
): string | null {
	// 3: a lone digit or two letters would light up nearly any link
	const words = searchWords(query)
		.map((word) => word.toLowerCase())
		.filter((word) => word.length >= 3);
	const wordsIn = (candidate: string) =>
		words.filter((word) => candidate.toLowerCase().includes(word)).length;
	const candidates = [
		...ship.people.flatMap((person) => [person.email, person.slackId, person.hackatimeUserId]),
		ship.repoUrl,
		ship.demoUrl
	].filter((candidate) => candidate !== null);
	const best = candidates.toSorted((left, right) => wordsIn(right) - wordsIn(left))[0];
	return best && wordsIn(best) > 0 ? best : null;
}
