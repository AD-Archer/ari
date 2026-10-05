import type { Evidence, Prisma } from '$db';
import { originOf } from '$lib/server/outboundSigning';
import {
	evidenceKinds,
	parseReauthTtl,
	parseReviewGoal,
	settingsTexts,
	settingsToggles,
	validateSettings,
	type SettingsValues
} from '$lib/settingsRules';

export function readSettingsForm(form: FormData): SettingsValues {
	const values = {
		accepts: Object.fromEntries(
			evidenceKinds.map((kind) => [kind, form.get(`accept_${kind}`) === 'on'])
		)
	} as SettingsValues;
	for (const key of settingsToggles) values[key] = form.get(key) === 'on';
	for (const key of settingsTexts) values[key] = String(form.get(key) ?? '').trim();
	return values;
}

export interface ParsedSettings {
	values: SettingsValues;
	accepts: Evidence[];
	trackingStartsAt: Date | null;
	reauthTtlMinutes: number | null;
	reviewGoal: number;
}

export type ParseResult = { ok: true; settings: ParsedSettings } | { ok: false; error: string };

export function parseSettingsForm(form: FormData): ParseResult {
	const values = readSettingsForm(form);
	const error = validateSettings(values);
	if (error) return { ok: false, error };
	return {
		ok: true,
		settings: {
			values,
			accepts: evidenceKinds.filter((kind) => values.accepts[kind]),
			trackingStartsAt: values.trackingStartsAt
				? new Date(`${values.trackingStartsAt}T00:00:00Z`)
				: null,
			reauthTtlMinutes: parseReauthTtl(values.reviewerReauthTtlMinutes),
			reviewGoal: parseReviewGoal(values.reviewGoal) ?? 50 // unreachable: validation rejects it
		}
	};
}

export const priorSettingsSelect = {
	name: true,
	iconUrl: true,
	cardBgUrl: true,
	accepts: true,
	trackingStartsAt: true,
	collaborative: true,
	secondPass: true,
	secondPassApproved: true,
	secondPassChanges: true,
	secondPassRejected: true,
	secondPassOrganizerBypass: true,
	screenIdentity: true,
	screenHackatime: true,
	reviewersCannotReviewOwnProjects: true,
	allowDeflation: true,
	hoursJustification: true,
	reviewerReauth: true,
	reviewerReauthTtlMinutes: true,
	priorityReview: true,
	priorityReviewMessage: true,
	priorityReviewToken: true,
	weeklyReviewGoal: true,
	reviewersChannelId: true
} as const satisfies Prisma.ProgramSelect;

export type PriorSettings = Prisma.ProgramGetPayload<{ select: typeof priorSettingsSelect }>;

export interface NextSettings {
	settings: ParsedSettings;
	reauthTtlMinutes: number;
	reviewersChannelId: string | null;
	priorityTokenMinted: boolean;
}

export interface SettingsDiff {
	changed: string[];
	diff: Record<string, Prisma.InputJsonValue>;
}

// the column defaults stand in for a program row that could not be read
const toggleRules = [
	['collaborative', 'collaborative projects', false],
	['secondPass', 'second pass review', false],
	['secondPassApproved', 'second pass · approvals', true],
	['secondPassChanges', 'second pass · changes requests', true],
	['secondPassRejected', 'second pass · rejections', true],
	['secondPassOrganizerBypass', 'second pass · organizer bypass', true],
	['screenIdentity', 'identity screening', true],
	['screenHackatime', 'Hackatime screening', true],
	['reviewersCannotReviewOwnProjects', 'reviewers cannot review own projects', false],
	['allowDeflation', 'hour deflation', true],
	['hoursJustification', 'hours justification', true]
] as const;

export function diffSettings(
	prior: PriorSettings | null,
	priorOutbound: { url: string | null; enabled: boolean } | null,
	next: NextSettings
): SettingsDiff {
	const { values, accepts, reviewGoal } = next.settings;
	const changed: string[] = [];
	const diff: Record<string, Prisma.InputJsonValue> = {};
	const record = (label: string, key: string, change: Prisma.InputJsonValue) => {
		changed.push(label);
		diff[key] = change;
	};

	if (prior && prior.name !== values.displayName) {
		record('name', 'name', { from: prior.name, to: values.displayName });
	}
	if ((prior?.iconUrl ?? '') !== values.iconUrl || (prior?.cardBgUrl ?? '') !== values.cardBgUrl) {
		record('branding', 'branding', {
			icon: { from: prior?.iconUrl ?? null, to: values.iconUrl || null },
			cardBg: { from: prior?.cardBgUrl ?? null, to: values.cardBgUrl || null }
		});
	}
	if ([...(prior?.accepts ?? [])].sort().join(',') !== [...accepts].sort().join(',')) {
		record('evidence', 'evidence', { from: prior?.accepts ?? [], to: accepts });
	}
	const priorTracking = prior?.trackingStartsAt?.toISOString().slice(0, 10) ?? '';
	if (priorTracking !== values.trackingStartsAt) {
		record('tracking start', 'trackingStartsAt', {
			from: priorTracking || null,
			to: values.trackingStartsAt || null
		});
	}
	for (const [key, label, fallback] of toggleRules) {
		const from = prior?.[key] ?? fallback;
		if (from !== values[key]) record(label, key, { from, to: values[key] });
	}
	if ((prior?.reviewerReauth ?? false) !== values.reviewerReauth) {
		record('reviewer reauthentication', 'reviewerReauth', {
			from: prior?.reviewerReauth ?? false,
			to: values.reviewerReauth
		});
	}
	// 60 minutes is the column default
	if ((prior?.reviewerReauthTtlMinutes ?? 60) !== next.reauthTtlMinutes) {
		record('reauth inactivity timeout', 'reviewerReauthTtlMinutes', {
			from: prior?.reviewerReauthTtlMinutes ?? 60,
			to: next.reauthTtlMinutes
		});
	}
	if ((prior?.priorityReview ?? false) !== values.priorityReview) {
		record('priority review', 'priorityReview', {
			from: prior?.priorityReview ?? false,
			to: values.priorityReview
		});
	}
	if ((prior?.priorityReviewMessage ?? '') !== values.priorityReviewMessage) {
		// 120 characters: the audit feed only needs the gist of a long message
		record('priority form message', 'priorityReviewMessage', {
			from: (prior?.priorityReviewMessage ?? '').slice(0, 120) || null,
			to: values.priorityReviewMessage.slice(0, 120) || null
		});
	}
	// the token never goes in the diff: the url it forms is the form's only gate
	if (next.priorityTokenMinted) changed.push('priority form link minted');
	// 50 reviews a week is the column default
	if ((prior?.weeklyReviewGoal ?? 50) !== reviewGoal) {
		record('weekly review goal', 'weeklyReviewGoal', {
			from: prior?.weeklyReviewGoal ?? 50,
			to: reviewGoal
		});
	}
	if ((prior?.reviewersChannelId ?? null) !== next.reviewersChannelId) {
		record('reviewers channel', 'reviewersChannelId', {
			from: prior?.reviewersChannelId ?? null,
			to: next.reviewersChannelId
		});
	}
	if ((priorOutbound?.url ?? '') !== values.outUrl) {
		// origin only: the path can carry the destination's token and plain reviewers read the feed
		record('webhook URL', 'outUrl', {
			from: originOf(priorOutbound?.url ?? ''),
			to: originOf(values.outUrl)
		});
	}
	if ((priorOutbound?.enabled ?? true) !== values.outEnabled) {
		record('webhook enabled', 'outEnabled', {
			from: priorOutbound?.enabled ?? true,
			to: values.outEnabled
		});
	}
	return { changed, diff };
}
