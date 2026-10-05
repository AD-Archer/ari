import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { ago, evidenceSeconds } from '$lib/server/serialize';
import { formTokenPattern, ownShipsWhere, type MakerIdentity } from '$lib/server/priorityForm';

export type MarkResult =
	| { ok: true; marked: number }
	| { ok: false; status: number; error: string };

export async function formProgram(token: string) {
	if (!formTokenPattern.test(token)) throw error(404, 'Not found');
	const program = await db.program.findUnique({
		where: { priorityReviewToken: token },
		select: {
			id: true,
			name: true,
			color: true,
			iconUrl: true,
			cardBgUrl: true,
			status: true,
			priorityReview: true,
			priorityReviewMessage: true
		}
	});
	if (!program) throw error(404, 'Not found');
	return program;
}

// a link that was turned off, or whose program was archived, is real: it shows as closed, not 404
const isOpen = (program: { priorityReview: boolean; status: string }) =>
	program.priorityReview && program.status === 'ACTIVE';

export async function loadPriorityForm(token: string, identity: MakerIdentity | null) {
	const program = await formProgram(token);
	const base = {
		program: {
			name: program.name,
			color: program.color,
			iconUrl: program.iconUrl,
			cardBgUrl: program.cardBgUrl
		},
		message: program.priorityReviewMessage,
		open: isOpen(program)
	};
	if (!base.open || !identity) return { ...base, ident: null, ships: [] };

	const makerRow = await db.maker.findFirst({
		where: {
			OR: [
				{ email: { equals: identity.email, mode: 'insensitive' } },
				...(identity.slackId ? [{ slackId: identity.slackId }] : [])
			]
		},
		select: { name: true, slackId: true }
	});

	// processing ships are included: a mark set now applies the moment they reach the queue
	const ships = await db.submission.findMany({
		where: {
			programId: program.id,
			status: { in: ['processing', 'pending'] },
			...ownShipsWhere(identity)
		},
		orderBy: { receivedAt: 'asc' },
		select: {
			id: true,
			title: true,
			track: true,
			status: true,
			receivedAt: true,
			thumbnailUrl: true,
			priority: true,
			hours: true
		}
	});

	return {
		...base,
		ident: {
			email: identity.email,
			name: identity.name ?? makerRow?.name ?? null,
			slackId: identity.slackId ?? makerRow?.slackId ?? null
		},
		ships: ships.map((ship) => ({
			id: ship.id,
			title: ship.title,
			track: ship.track,
			processing: ship.status === 'processing',
			ago: ago(ship.receivedAt),
			loggedSeconds: evidenceSeconds(ship.hours),
			thumbnailUrl: ship.thumbnailUrl,
			priority: ship.priority
		}))
	};
}

// the posted ids are advisory: what gets marked is re-resolved against the verified maker's own
// open ships in this program, so a forged id cannot touch anyone else's ship
export async function markPriority(
	token: string,
	identity: MakerIdentity | null,
	postedIds: string[]
): Promise<MarkResult> {
	const program = await formProgram(token);
	if (!isOpen(program))
		return { ok: false, status: 403, error: 'Priority review is closed for this program.' };
	if (!identity)
		return { ok: false, status: 401, error: 'Your sign-in expired. Sign in again below.' };

	const ids = [...new Set(postedIds.filter(Boolean))];
	if (!ids.length) return { ok: false, status: 400, error: 'Pick at least one project first.' };
	// 200: far more open ships than one maker has in a program
	if (ids.length > 200)
		return { ok: false, status: 400, error: 'That is too many projects at once.' };

	const markable = await db.submission.findMany({
		where: {
			id: { in: ids },
			programId: program.id,
			status: { in: ['processing', 'pending'] },
			priority: false,
			...ownShipsWhere(identity)
		},
		select: { id: true, title: true }
	});
	if (!markable.length) return { ok: true, marked: 0 };

	await db.$transaction([
		db.submission.updateMany({
			where: { id: { in: markable.map((ship) => ship.id) } },
			data: { priority: true }
		}),
		...markable.map((ship) =>
			db.activityEvent.create({
				data: {
					programId: program.id,
					kind: 'PRIORITY' as const,
					submissionId: ship.id,
					text: `Priority review requested · ${ship.title}`,
					meta: { email: identity.email, submissionId: ship.id, title: ship.title }
				}
			})
		)
	]);
	return { ok: true, marked: markable.length };
}
