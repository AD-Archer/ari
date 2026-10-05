import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { systemUserId } from '$lib/server/systemUser';
import { organizerFilter } from '$lib/server/programs';
import type { Evidence } from '$lib/data';

export async function loadProgramBoard(user: App.SessionUser) {
	const weekAgo = new Date(Date.now() - 604800000); // 7 days: 7 * 24 * 60 * 60 * 1000

	// the create-only tier sees the programs it organizes or is poc of, which covers everything
	// it created. the manage tier sees them all
	const programScope = hasOrgPermission(user, 'MANAGE_PROGRAMS')
		? undefined
		: {
				memberships: { some: { userId: user.id, OR: [organizerFilter, { isPoc: true }] } }
			};

	const [rows, weekReviewCounts, organizerInvites, oldestPending, pocRows, users] =
		await Promise.all([
			db.program.findMany({
				where: programScope,
				orderBy: { createdAt: 'asc' },
				include: {
					_count: {
						select: {
							memberships: true,
							submissions: { where: { status: { in: ['pending'] } } }
						}
					},
					memberships: { where: organizerFilter, select: { user: { select: { email: true } } } }
				}
			}),
			// review has no programId, so the join and the tally happen in sql
			db.$queryRaw<{ programId: string; reviewCount: number }[]>`
				SELECT s."programId", COUNT(*)::int AS "reviewCount"
				FROM "Review" r
				JOIN "Submission" s ON s.id = r."submissionId"
				WHERE r."createdAt" >= ${weekAgo}
				GROUP BY s."programId"`,
			db.invite.findMany({
				where: { ...organizerFilter, acceptedAt: null, programId: { not: null } },
				select: { email: true, programId: true }
			}),
			db.submission.groupBy({
				by: ['programId'],
				where: { status: 'pending' },
				_min: { receivedAt: true }
			}),
			db.membership.findMany({
				where: { isPoc: true },
				select: {
					programId: true,
					user: { select: { name: true, email: true, avatarColor: true, slackId: true } }
				}
			}),
			db.user.findMany({
				where: { id: { not: systemUserId } },
				orderBy: { name: 'asc' },
				select: { name: true, email: true, avatarColor: true, slackId: true }
			})
		]);

	const pocByProgram = new Map(
		pocRows.map((membership) => [membership.programId, membership.user])
	);
	const weekByProgram = new Map(weekReviewCounts.map((row) => [row.programId, row.reviewCount]));

	const organizersByProgram = new Map<string, Set<string>>();
	const addOrganizer = (programId: string, email: string) => {
		const emails = organizersByProgram.get(programId) ?? new Set<string>();
		emails.add(email.toLowerCase());
		organizersByProgram.set(programId, emails);
	};
	for (const program of rows)
		for (const membership of program.memberships) addOrganizer(program.id, membership.user.email);
	for (const invite of organizerInvites)
		if (invite.programId) addOrganizer(invite.programId, invite.email);

	const oldestByProgram = new Map<string, Date>();
	for (const group of oldestPending)
		if (group._min?.receivedAt) oldestByProgram.set(group.programId, group._min.receivedAt);

	const programs = rows.map((program) => {
		const poc = pocByProgram.get(program.id);
		const oldest = oldestByProgram.get(program.id);
		return {
			name: program.name,
			id: program.id,
			color: program.color,
			iconUrl: program.iconUrl,
			status: program.status,
			accepts: program.accepts as Evidence[],
			allowVms: program.allowVms,
			secondPass: program.secondPass,
			organizers: [...(organizersByProgram.get(program.id) ?? [])],
			poc: poc
				? { name: poc.name, email: poc.email, color: poc.avatarColor, slackId: poc.slackId }
				: null,
			needsPoc: program.status !== 'ARCHIVED' && !poc,
			reviewers: program._count.memberships,
			pending: program._count.submissions,
			week: weekByProgram.get(program.id) ?? 0,
			// clamped: receivedAt is client-supplied at ingest and may sit in the future
			oldestDays: oldest
				? Math.max(0, Math.floor((Date.now() - oldest.getTime()) / 86400000)) // ms in a day: 24 * 60 * 60 * 1000
				: 0
		};
	});

	const people = users.map((person) => ({
		name: person.name,
		email: person.email,
		color: person.avatarColor,
		slackId: person.slackId
	}));

	return { programs, people };
}

export type ProgramBoard = Awaited<ReturnType<typeof loadProgramBoard>>;
export type BoardProgram = ProgramBoard['programs'][number];
export type BoardPerson = ProgramBoard['people'][number];
