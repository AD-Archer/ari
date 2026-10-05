import { error } from '@sveltejs/kit';
import { clampSeconds, formatHoursApprox, minutesToSeconds } from '$lib/time';
import type { TimelineItem } from '$lib/review/reviewTypes';
import { canAccessProgram } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { ago, shipAuthorName, whenLabel } from '$lib/server/serialize';
import { assertViewable } from '$lib/server/review/guards';

// ingest is left out: the submitted entry comes from the ship row, so ships older than
// activity logging still have one
const timelineKinds = [
	'APPROVED',
	'CHANGES',
	'REJECTED',
	'REVERT',
	'VM',
	'PRIORITY',
	'SHIP_EDIT'
] as const;

const decisions = {
	APPROVED: { kind: 'approved', verb: 'Approved' },
	CHANGES: { kind: 'changes', verb: 'Changes requested' },
	REJECTED: { kind: 'rejected', verb: 'Rejected' }
} as const;

type Who = TimelineItem['who'];
type SortableItem = TimelineItem & { at: number };

const stamp = (date: Date) => ({
	at: date.getTime(),
	iso: date.toISOString(),
	ago: `${ago(date)} ago`,
	whenLabel: whenLabel(date)
});

const printable = (value: unknown) =>
	Array.isArray(value)
		? value.map(String).join(', ') || 'None'
		: value === null || value === undefined || value === ''
			? 'None'
			: String(value);

// events the old app wrote only carry minutes
function approvedSecondsOf(meta: Record<string, unknown>): number | null {
	if (typeof meta.approvedSeconds === 'number')
		return clampSeconds(meta.approvedSeconds, Number.MAX_SAFE_INTEGER);
	if (typeof meta.approvedMinutes === 'number' && Number.isSafeInteger(meta.approvedMinutes))
		return minutesToSeconds(Math.max(0, meta.approvedMinutes));
	return null;
}

function decisionDetail(kind: keyof typeof decisions, meta: Record<string, unknown>, text: string) {
	const decision = decisions[kind];
	// an automatic rejection already reads as a short human reason
	if (meta.auto) return text || decision.verb;
	let detail: string = decision.verb;
	const approvedSeconds = approvedSecondsOf(meta);
	if (kind === 'APPROVED' && approvedSeconds !== null)
		detail += ` · ${formatHoursApprox(approvedSeconds)}h`;
	if (meta.secondPass === 'pending') detail += ' (held for second pass)';
	else if (meta.fraudReview === 'pending') detail += ' (held for fraud review)';
	else if (meta.op === 'second-pass-confirmed') detail += ' (confirmed)';
	else if (meta.op === 'second-pass-overridden') detail += ' (second-pass override)';
	return detail;
}

function editChanges(meta: Record<string, unknown>) {
	return (Array.isArray(meta.changes) ? meta.changes : []).flatMap((raw) => {
		if (!raw || typeof raw !== 'object') return [];
		const change = raw as { label?: unknown; field?: unknown; from?: unknown; to?: unknown };
		return [
			{
				label: typeof change.label === 'string' ? change.label : String(change.field ?? 'Field'),
				from: printable(change.from),
				to: printable(change.to)
			}
		];
	});
}

export async function shipTimeline(
	user: App.SessionUser | null,
	programId: string,
	submissionId: string
): Promise<TimelineItem[]> {
	if (!user) throw error(401, 'Sign in first');
	if (!canAccessProgram(user, programId)) throw error(403, "You don't have access to this program");

	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: {
			track: true,
			status: true,
			receivedAt: true,
			authorNameOverrides: true,
			maker: { select: { name: true, email: true, slackId: true } },
			collaborators: {
				select: { maker: { select: { name: true, email: true, slackId: true } } },
				orderBy: { id: 'asc' }
			},
			program: { select: { reviewersCannotReviewOwnProjects: true } },
			opens: {
				orderBy: { openedAt: 'asc' },
				select: {
					id: true,
					openedAt: true,
					closedAt: true,
					closeReason: true,
					reviewer: { select: { name: true, avatarColor: true, slackId: true } }
				}
			}
		}
	});
	if (!ship) throw error(404, 'Submission not found');
	assertViewable(user, programId, ship, ship.program.reviewersCannotReviewOwnProjects);

	const events = await db.activityEvent.findMany({
		where: { submissionId, kind: { in: [...timelineKinds] } },
		orderBy: { createdAt: 'asc' },
		select: { id: true, kind: true, actorId: true, createdAt: true, meta: true, text: true }
	});
	const actorIds = [
		...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))
	];
	const actors = actorIds.length
		? await db.user.findMany({
				where: { id: { in: actorIds } },
				select: { id: true, name: true, avatarColor: true, slackId: true }
			})
		: [];
	const actorById = new Map(actors.map((actor) => [actor.id, actor]));

	// a maker has no account: their events carry a verified email instead of an actor
	const peopleByEmail = new Map(
		[ship.maker, ...ship.collaborators.map((collaborator) => collaborator.maker)].map((maker) => [
			maker.email.toLowerCase(),
			{ name: shipAuthorName(ship, maker), color: 'var(--text-3)', slackId: maker.slackId }
		])
	);

	const items: SortableItem[] = [
		{
			id: 'submitted',
			kind: 'submitted',
			...stamp(ship.receivedAt),
			who: {
				name: shipAuthorName(ship, ship.maker),
				color: 'var(--text-3)',
				slackId: ship.maker.slackId
			},
			detail: 'Ship submitted'
		}
	];

	for (const open of ship.opens) {
		const who: Who = {
			name: open.reviewer.name,
			color: open.reviewer.avatarColor,
			slackId: open.reviewer.slackId
		};
		items.push({
			id: `open-${open.id}`,
			kind: 'opened',
			...stamp(open.openedAt),
			who,
			detail: 'Opened for review'
		});
		// a decided close is shown by the decision row: the ship did not go back up for grabs
		if (open.closedAt && open.closeReason !== 'decided')
			items.push({
				id: `close-${open.id}`,
				kind: 'closed',
				...stamp(open.closedAt),
				who,
				detail:
					open.closeReason === 'idle'
						? 'Session timed out, back in the queue'
						: open.closeReason === 'taken'
							? 'Session taken over by an organizer'
							: 'Session ended, back in the queue'
			});
	}

	for (const event of events) {
		const meta = (event.meta ?? {}) as Record<string, unknown>;
		const actor = event.actorId ? actorById.get(event.actorId) : undefined;
		const who: Who = actor
			? { name: actor.name, color: actor.avatarColor, slackId: actor.slackId }
			: { name: 'System', color: 'var(--text-3)', slackId: null };
		const base = { id: event.id, ...stamp(event.createdAt), who };

		if (event.kind === 'APPROVED' || event.kind === 'CHANGES' || event.kind === 'REJECTED') {
			items.push({
				...base,
				kind: decisions[event.kind].kind,
				detail: decisionDetail(event.kind, meta, event.text)
			});
		} else if (event.kind === 'REVERT') {
			items.push({
				...base,
				kind: 'reverted',
				detail: `Reopened · ${String(meta.fromStatus ?? '-')} → ${String(meta.toStatus ?? 'pending')}`
			});
		} else if (event.kind === 'PRIORITY') {
			const email = typeof meta.email === 'string' ? meta.email : '';
			items.push({
				...base,
				kind: 'priority',
				who: email
					? (peopleByEmail.get(email.toLowerCase()) ?? {
							name: email,
							color: 'var(--text-3)',
							slackId: null
						})
					: who,
				detail: 'Requested priority review'
			});
		} else if (event.kind === 'SHIP_EDIT') {
			const changes = editChanges(meta);
			items.push({
				...base,
				kind: 'edit',
				detail: `Edited ship · ${changes.length} field${changes.length === 1 ? '' : 's'}`,
				changes
			});
		} else if (event.kind === 'VM') {
			const type = typeof meta.type === 'string' ? meta.type : '';
			if (meta.op === 'launch')
				items.push({
					...base,
					kind: 'vmLaunch',
					detail: `Launched a ${type} VM`.replace('  ', ' ').trim()
				});
			else if (meta.op === 'reap')
				items.push({
					...base,
					kind: 'vmReap',
					detail:
						meta.reason === 'expired' ? 'VM auto-deleted (max lifetime)' : 'Idle VM auto-deleted'
				});
			else items.push({ ...base, kind: 'vmStop', detail: 'Deleted the review VM' });
		}
	}

	// the id breaks ties between rows sharing a timestamp
	items.sort((first, second) => first.at - second.at || first.id.localeCompare(second.id));
	return items.map((item) => ({
		id: item.id,
		kind: item.kind,
		iso: item.iso,
		ago: item.ago,
		whenLabel: item.whenLabel,
		who: item.who,
		detail: item.detail,
		...(item.changes ? { changes: item.changes } : {})
	}));
}
