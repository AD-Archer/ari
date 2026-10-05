import { db } from '$lib/server/db';
import { ago, whenLabel } from '$lib/server/serialize';
import { trackScope, requirePermission } from '$lib/server/authz';
import { kindMeta, describe, integrationKinds, type Meta } from '$lib/server/activityLog';
import type { Prisma } from '$db';
import type { PageServerLoad } from './$types';
import type { ActivityEntry, ActivityLog, MentionProfile, TextPart } from './activityTypes';

// a dotted tld is required, so a synthetic address without one never matches
const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

type Profile = Omit<MentionProfile, 'email'>;

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { programId } = await parent();

	// the log exposes member emails and decision audit traces: this is the gate for direct urls
	requirePermission(locals.user!, programId, 'VIEW_AUDIT_LOG');

	// viewers are usually unscoped, the filter stays as the safety net if the gate ever loosens
	const scope = trackScope(locals.user!, programId);

	const events = buildEvents(programId, scope, url.searchParams.get('all') === '1');
	// streamed: a rejection must not surface before the page has subscribed
	events.catch(() => {});
	return { events };
};

function collectEmails(text: string, into: Set<string>) {
	for (const match of text.match(emailPattern) ?? []) into.add(match.toLowerCase());
}

async function buildEvents(
	programId: string,
	scope: ReturnType<typeof trackScope>,
	all: boolean
): Promise<ActivityLog> {
	// integration events live on the org webhooks page, never in a program's audit log
	let where: Prisma.ActivityEventWhereInput = {
		programId,
		kind: { notIn: [...integrationKinds] }
	};
	if (scope) {
		const inScope = await db.submission.findMany({
			where: { programId, track: { in: scope } },
			select: { id: true }
		});
		where = {
			programId,
			kind: { notIn: [...integrationKinds] },
			OR: [
				{ submissionId: null },
				{ submissionId: { in: inScope.map((submission) => submission.id) } }
			]
		};
	}

	const [rows, total] = await Promise.all([
		db.activityEvent.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			// the log grows without bound, so the default visit loads the latest 500 only
			...(all ? {} : { take: 500 })
		}),
		db.activityEvent.count({ where })
	]);

	const actorIds = [...new Set(rows.map((row) => row.actorId).filter((id): id is string => !!id))];
	const actors = actorIds.length
		? await db.user.findMany({
				where: { id: { in: actorIds } },
				select: { id: true, name: true, avatarColor: true, slackId: true }
			})
		: [];
	const actorById = new Map(actors.map((actor) => [actor.id, actor]));

	const emails = new Set<string>();
	for (const row of rows) {
		collectEmails(row.text, emails);
		const meta = (row.meta ?? {}) as Meta;
		for (const value of [meta.email, meta.makerEmail, meta.maker])
			if (typeof value === 'string') collectEmails(value, emails);
		for (const list of [meta.collaborators, meta.who])
			if (Array.isArray(list))
				for (const value of list) if (typeof value === 'string') collectEmails(value, emails);
	}
	const emailList = [...emails];
	const [userProfiles, makerProfiles] = emailList.length
		? await Promise.all([
				db.user.findMany({
					where: { email: { in: emailList } },
					select: { email: true, name: true, avatarColor: true, slackId: true }
				}),
				db.maker.findMany({
					where: { email: { in: emailList } },
					select: { email: true, name: true, slackId: true }
				})
			])
		: [[], []];
	// members win over makers. an unmatched email (a pending invite) stays plain text
	const profileByEmail = new Map<string, Profile>();
	for (const maker of makerProfiles)
		if (maker.name)
			profileByEmail.set(maker.email.toLowerCase(), {
				name: maker.name,
				color: 'var(--text-3)',
				slackId: maker.slackId
			});
	for (const user of userProfiles)
		profileByEmail.set(user.email.toLowerCase(), {
			name: user.name,
			color: user.avatarColor,
			slackId: user.slackId
		});

	const mentionize = (text: string): TextPart[] => {
		const parts: TextPart[] = [];
		let last = 0;
		for (const match of text.matchAll(emailPattern)) {
			const profile = profileByEmail.get(match[0].toLowerCase());
			if (!profile) continue;
			if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
			parts.push({ type: 'user', ...profile, email: match[0] });
			last = match.index + match[0].length;
		}
		if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
		return parts;
	};

	const now = Date.now();
	const mapped = rows.map((event): ActivityEntry => {
		const look = kindMeta[event.kind];
		const actor = event.actorId ? actorById.get(event.actorId) : undefined;
		const meta = (event.meta ?? {}) as Meta;
		const { detail: rawDetail, rows: detailRows } = describe(event.kind, meta);
		// the main text often already carries the detail line
		const detail = rawDetail && !event.text.includes(rawDetail) ? rawDetail : '';
		return {
			id: event.id,
			icon: look.icon,
			color: look.color,
			action: look.action,
			actorName: actor?.name ?? '',
			actorColor: actor?.avatarColor ?? 'var(--text-3)',
			actorSlackId: actor?.slackId ?? null,
			text: event.text,
			textParts: mentionize(event.text),
			detail,
			detailRows: detailRows.map((row) => {
				const trimmed = row.value.trim();
				const only = trimmed.match(emailPattern);
				if (only && only.length === 1 && only[0] === trimmed) {
					const profile = profileByEmail.get(only[0].toLowerCase());
					if (profile) return { ...row, user: { ...profile, email: only[0] } };
				}
				return row;
			}),
			submissionId: event.submissionId ?? '',
			href: event.submissionId ? `/p/${programId}/review/${event.submissionId}` : null,
			when: ago(event.createdAt) === 'now' ? 'just now' : `${ago(event.createdAt)} ago`,
			whenLabel: whenLabel(event.createdAt),
			iso: event.createdAt.toISOString(),
			ageDays: Math.floor((now - event.createdAt.getTime()) / 86400000) // ms in a day: 24 * 60 * 60 * 1000
		};
	});
	return { rows: mapped, total };
}
