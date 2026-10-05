import { privateProvider } from '$private';
import { clampSeconds, formatHoursApprox } from '$lib/time';
import type { ActivityKind } from '$db';

export type EvMeta = { icon: string; color: string; action: string };
export type Row = { key: string; value: string };
export type Meta = Record<string, unknown>;

export const kindMeta: Record<ActivityKind, EvMeta> = {
	APPROVED: { icon: 'check', color: 'var(--color-green)', action: 'Approved' },
	CHANGES: { icon: 'clock', color: 'var(--color-orange)', action: 'Changes' },
	REJECTED: { icon: 'x', color: 'var(--color-red)', action: 'Rejected' },
	WEBHOOK: { icon: 'inbox', color: 'var(--color-blue)', action: 'Ingest' },
	REVERT: { icon: 'refresh', color: 'var(--color-yellow)', action: 'Reverted' },
	MEMBER: { icon: 'user', color: 'var(--color-purple)', action: 'Member' },
	FLAG: { icon: 'flag', color: 'var(--color-orange)', action: 'Flag' },
	SETTINGS: { icon: 'settings', color: 'var(--color-blue)', action: 'Settings' },
	SECRET: { icon: 'lock', color: 'var(--color-red)', action: 'Secret' },
	DELIVERY: { icon: 'external', color: 'var(--color-red)', action: 'Delivery' },
	EVIDENCE: { icon: 'info', color: 'var(--color-orange)', action: 'Evidence' },
	VM: { icon: 'play', color: 'var(--color-blue)', action: 'VM' },
	PRIORITY: { icon: 'star', color: 'var(--color-yellow)', action: 'Priority' },
	SHIP_EDIT: { icon: 'config', color: 'var(--color-blue)', action: 'Edited ship' }
};

// written by ingest, sender and enrichment, so they stay out of a program's audit log
export const integrationKinds = [
	'WEBHOOK',
	'DELIVERY',
	'EVIDENCE'
] as const satisfies ActivityKind[];

const yesNo = (value: unknown) => (value ? 'Yes' : 'No');

const stringList = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
		: [];

// labels only. meta is json with no seconds column: old events hold minutes or float hours
const hoursLabel = (seconds: number): string =>
	formatHoursApprox(clampSeconds(seconds, Number.MAX_SAFE_INTEGER) ?? 0);
const minutesLabel = (minutes: unknown): string =>
	hoursLabel(typeof minutes === 'number' ? minutes * 60 : 0); // seconds in a minute

const printable = (value: unknown) =>
	Array.isArray(value)
		? value.map(String).join(', ') || '∅'
		: value === null || value === undefined || value === ''
			? '∅'
			: String(value);

const onOff = (value: unknown) => (value ? 'on' : 'off');

function describeSettings(
	meta: Meta,
	rows: Row[],
	push: (key: string, value: unknown) => void
): { detail: string; rows: Row[] } {
	if (meta.sub === 'checklist' || meta.sub === 'reviewField') {
		push('Item', meta.label);
		if (meta.type) push('Type', meta.type);
		return { detail: String(meta.label ?? ''), rows };
	}
	if (meta.sub === 'status') {
		push('From', meta.from);
		push('To', meta.to);
		return { detail: `${meta.from ?? ''} → ${meta.to ?? 'ARCHIVED'}`, rows };
	}
	if (meta.event === 'program_created') {
		push('Name', meta.name);
		push('Evidence', Array.isArray(meta.accepts) ? meta.accepts.join(', ') : '');
		push('Organizers', Array.isArray(meta.organizers) ? meta.organizers.join(', ') : '');
		return { detail: `created ${meta.name ?? ''}`.trim(), rows };
	}
	const diff = (meta.diff ?? {}) as Record<string, unknown>;
	const fromTo = (value: unknown) => {
		const change = value as { from?: unknown; to?: unknown };
		return `${change?.from ?? '∅'} → ${change?.to ?? '∅'}`;
	};
	if (diff.name) push('Name', fromTo(diff.name));
	if (diff.evidence) {
		const evidence = diff.evidence as { from?: string[]; to?: string[] };
		push(
			'Accepted evidence',
			`${(evidence.from ?? []).join(', ') || '∅'} → ${(evidence.to ?? []).join(', ') || '∅'}`
		);
	}
	if (Array.isArray(diff.flags))
		for (const flag of diff.flags as { kind: string; from: boolean; to: boolean }[])
			push(`Flag ${flag.kind}`, `${onOff(flag.from)} → ${onOff(flag.to)}`);
	if (diff.trackingStartsAt) {
		const tracking = diff.trackingStartsAt as { from?: string | null; to?: string | null };
		push('Tracking start', `${tracking.from ?? 'no limit'} → ${tracking.to ?? 'no limit'}`);
	}
	if (diff.outUrl) push('Delivery URL', fromTo(diff.outUrl));
	if (diff.outEnabled) push('Delivery enabled', fromTo(diff.outEnabled));
	if (diff.allowVms) {
		const allowVms = diff.allowVms as { from?: boolean; to?: boolean };
		push('Reviewer VMs', `${onOff(allowVms.from)} → ${onOff(allowVms.to)}`);
	}
	const changed = Array.isArray(meta.changed) ? (meta.changed as string[]) : [];
	return { detail: changed.length ? changed.join(', ') : 'settings updated', rows };
}

export function describe(kind: ActivityKind, meta: Meta): { detail: string; rows: Row[] } {
	const rows: Row[] = [];
	const push = (key: string, value: unknown) => {
		if (value !== undefined && value !== null && value !== '')
			rows.push({ key, value: String(value) });
	};

	const pushMakers = (solo: unknown) => {
		const collaborators = stringList(meta.collaborators);
		if (collaborators.length) push('Makers', collaborators.join(', '));
		else push('Maker', solo);
	};

	// only an automated decision carries a machine reason
	const pushAutoReason = () => {
		if (typeof meta.reason !== 'string' || !meta.reason) return;
		push('Reason', privateProvider.describeAutoReason(meta.reason) ?? 'Automated check');
	};

	switch (kind) {
		case 'APPROVED': {
			const hours =
				typeof meta.approvedSeconds === 'number'
					? hoursLabel(meta.approvedSeconds)
					: typeof meta.approvedMinutes === 'number'
						? minutesLabel(meta.approvedMinutes)
						: typeof meta.approvedHours === 'number'
							? hoursLabel(meta.approvedHours * 3600) // legacy float hours: 60 * 60 seconds each
							: '0';
			push('Verified hours', hours + 'h');
			const breakdownSeconds = meta.breakdownSeconds as Record<string, number> | undefined;
			const breakdown = meta.breakdown as Record<string, number> | undefined;
			if (breakdownSeconds)
				push(
					'Breakdown',
					`hackatime ${hoursLabel(breakdownSeconds.hackatime)}h · journals ${hoursLabel(breakdownSeconds.journals)}h · lapse ${hoursLabel(breakdownSeconds.lapse)}h`
				);
			else if (breakdown)
				push(
					'Breakdown',
					`hackatime ${minutesLabel(breakdown.hackatime)}h · journals ${minutesLabel(breakdown.journals)}h · lapse ${minutesLabel(breakdown.lapse)}h`
				);
			pushMakers(meta.maker);
			pushAutoReason();
			push('Note to maker', yesNo(meta.hasNote));
			push('Internal audit note', yesNo(meta.hasAudit));
			return { detail: `${hours}h approved`, rows };
		}
		case 'CHANGES':
			pushMakers(meta.maker);
			pushAutoReason();
			push('Note to maker', yesNo(meta.hasNote));
			push('Internal audit note', yesNo(meta.hasAudit));
			return { detail: meta.hasNote ? 'note left for the maker' : 'changes requested', rows };
		case 'REJECTED': {
			pushMakers(meta.maker);
			pushAutoReason();
			const people = stringList(meta.who);
			if (people.length) push('No hours', people.join(', '));
			push('Note to maker', yesNo(meta.hasNote));
			push('Internal audit note', yesNo(meta.hasAudit));
			return { detail: 'rejected', rows };
		}
		case 'REVERT':
			push('Reopened from', meta.fromStatus);
			push('New status', meta.toStatus);
			pushMakers(meta.maker);
			push('Audit reason', meta.auditReason);
			return { detail: `${meta.fromStatus ?? '-'} → ${meta.toStatus ?? 'pending'}`, rows };
		case 'WEBHOOK':
			pushMakers(meta.makerEmail);
			push('External ID', meta.externalId);
			if (meta.op === 'withdrawn') return { detail: 'withdrawn by program', rows };
			push('Journals', meta.journals);
			push('Evidence', Array.isArray(meta.evidence) ? meta.evidence.join(', ') : '');
			return { detail: 'ship received', rows };
		case 'SECRET':
			push(
				'Scope',
				meta.scope === 'outbound' ? 'Outbound signing secret' : 'Ingest signing secret'
			);
			push('New secret', meta.last4 ? `••••${meta.last4}` : '');
			return { detail: meta.last4 ? `••••${meta.last4}` : '', rows };
		case 'MEMBER':
			push('Email', meta.email);
			if (meta.fromRole || meta.toRole) push('Role change', `${meta.fromRole} → ${meta.toRole}`);
			else push('Role', meta.role);
			return {
				detail:
					meta.fromRole && meta.toRole
						? `${meta.fromRole} → ${meta.toRole}`
						: String(meta.role ?? ''),
				rows
			};
		case 'EVIDENCE': {
			push('Source', meta.source);
			push('Attempt', meta.attempt);
			push('Error', meta.error);
			if (Array.isArray(meta.notes) && meta.notes.length > 1) {
				push('All notes', (meta.notes as unknown[]).join(' · '));
			}
			const errorText = typeof meta.error === 'string' ? meta.error : '';
			return {
				detail: meta.exhausted
					? `gave up after ${meta.attempt ?? '?'} attempts`
					: errorText.slice(0, 80) || 'capture attempt failed',
				rows
			};
		}
		case 'VM': {
			if (meta.type) push('Type', meta.type);
			push('VM id', meta.vmid);
			if (meta.op === 'launch') return { detail: `launched a ${meta.type ?? ''} VM`.trim(), rows };
			if (meta.op === 'reap') return { detail: 'idle VM auto-deleted', rows };
			return { detail: 'deleted a review VM', rows };
		}
		case 'PRIORITY':
			push('Maker', meta.email);
			push('Ship', meta.title);
			return { detail: 'priority review requested by the maker', rows };
		case 'SHIP_EDIT': {
			const changes = Array.isArray(meta.changes) ? meta.changes : [];
			for (const raw of changes) {
				if (!raw || typeof raw !== 'object') continue;
				const item = raw as { label?: unknown; field?: unknown; from?: unknown; to?: unknown };
				push(
					typeof item.label === 'string' ? item.label : String(item.field ?? 'Field'),
					`${printable(item.from)} → ${printable(item.to)}`
				);
			}
			return {
				detail: `${rows.length} field${rows.length === 1 ? '' : 's'} changed`,
				rows
			};
		}
		case 'DELIVERY': {
			const status = (meta.status as string) ?? 'FAILED';
			push('Event', meta.event);
			push('Status', status);
			if (meta.test) push('Test ping', 'Yes');
			push('HTTP status', meta.httpStatus ?? '-');
			push('Attempts', meta.attempts);
			push('Reason', meta.errorDetail);
			push('Destination', meta.url);
			const verb =
				status === 'DELIVERED' ? 'delivered' : status === 'RETRYING' ? 'retrying' : 'failed';
			const reason = typeof meta.errorDetail === 'string' ? meta.errorDetail : '';
			return {
				detail:
					`${verb} · HTTP ${meta.httpStatus ?? '-'}` + (reason ? ` · ${reason.slice(0, 80)}` : ''),
				rows
			};
		}
		case 'SETTINGS':
			return describeSettings(meta, rows, push);
		default:
			return privateProvider.describeActivity(kind, meta) ?? { detail: '', rows };
	}
}

// a successful send should not read as an alarming red
export function deliveryLook(base: EvMeta, meta: Meta): { icon: string; color: string } {
	if (meta.status === 'DELIVERED') return { icon: 'check', color: 'var(--color-green)' };
	if (meta.status === 'RETRYING') return { icon: 'refresh', color: 'var(--color-yellow)' };
	return { icon: base.icon, color: base.color };
}
