import { db } from '$lib/server/db';
import { requireOrgPermission } from '$lib/server/authz';
import { ago, whenLabel } from '$lib/server/serialize';
import {
	kindMeta,
	describe,
	deliveryLook,
	integrationKinds,
	type Meta
} from '$lib/server/activityLog';
import type { BadgeTone, IconName } from '$lib/components/ui';
import type { PageServerLoad } from './$types';

function toneFor(kind: string, meta: Meta): BadgeTone {
	if (kind === 'WEBHOOK') return 'neutral';
	if (kind === 'EVIDENCE') return 'changes';
	if (meta.status === 'DELIVERED') return 'approved';
	if (meta.status === 'RETRYING') return 'pending';
	return 'rejected';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	requireOrgPermission(locals, 'VIEW_WEBHOOK_LOGS');
	const all = url.searchParams.get('all') === '1';

	const where = { kind: { in: [...integrationKinds] } };
	const [rows, total] = await Promise.all([
		db.activityEvent.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			// the default visit loads the latest 500 events; ?all=1 reaches the full history
			...(all ? {} : { take: 500 }),
			include: { program: { select: { name: true, color: true } } }
		}),
		db.activityEvent.count({ where })
	]);

	const actorIds = [
		...new Set(rows.map((row) => row.actorId).filter((id): id is string => Boolean(id)))
	];
	const actors = actorIds.length
		? await db.user.findMany({
				where: { id: { in: actorIds } },
				select: { id: true, name: true, avatarColor: true, slackId: true }
			})
		: [];
	const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

	const events = rows.map((event) => {
		const base = kindMeta[event.kind];
		const meta = (event.meta ?? {}) as Meta;
		const actor = event.actorId ? actorsById.get(event.actorId) : undefined;
		const look = event.kind === 'DELIVERY' ? deliveryLook(base, meta) : base;
		const { detail: rawDetail, rows: detailRows } = describe(event.kind, meta);
		// the inline detail is dropped when it only repeats the main text
		const detail = rawDetail && !event.text.includes(rawDetail) ? rawDetail : '';
		return {
			id: event.id,
			kind: event.kind,
			action: base.action,
			icon: look.icon as IconName,
			tone: toneFor(event.kind, meta),
			program: event.program.name,
			programColor: event.program.color,
			text: event.text,
			detail,
			detailRows,
			actorName: actor?.name ?? '',
			actorColor: actor?.avatarColor ?? 'var(--text-3)',
			actorSlackId: actor?.slackId ?? null,
			submissionId: event.submissionId ?? '',
			href: event.submissionId ? `/p/${event.programId}/review/${event.submissionId}` : null,
			when: ago(event.createdAt) === 'now' ? 'just now' : `${ago(event.createdAt)} ago`,
			whenLabel: whenLabel(event.createdAt),
			iso: event.createdAt.toISOString()
		};
	});

	return { events, total, capped: !all && rows.length < total };
};
