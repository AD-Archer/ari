import type { Prisma } from '$db';
import { toLegacyMinutes } from '$lib/time';
import type { PersonSeconds, SourceSeconds } from '$lib/review/settlement';
import { legacyMinutes } from '$lib/server/settlementStore';

// the evidence a settlement reads, in seconds, with the minute columns a legacy replay needs
export const settlementInclude = {
	collaborators: {
		orderBy: { id: 'asc' },
		select: {
			makerId: true,
			hackatimeSeconds: true,
			afterLastCommitSeconds: true,
			programSeconds: true,
			hackatimeMinutes: true,
			afterLastCommitMinutes: true,
			programMinutes: true,
			maker: { select: { name: true, email: true, slackId: true } }
		}
	},
	commits: { select: { id: true, codingSeconds: true, makerId: true } },
	devlogs: { select: { id: true, seconds: true, minutes: true, makerId: true } },
	clips: { select: { id: true, lengthSeconds: true, makerId: true } },
	hours: {
		select: {
			hackatimeSeconds: true,
			afterLastCommitSeconds: true,
			programSeconds: true,
			hackatimeMinutes: true,
			afterLastCommitMinutes: true,
			programMinutes: true
		}
	}
} satisfies Prisma.SubmissionInclude;

// old ari reads the minute keys, the new activity log prefers the seconds ones
export function decisionMeta(approvedSeconds: number, breakdown: SourceSeconds) {
	const minutes = legacyMinutes(approvedSeconds, breakdown);
	return {
		approvedSeconds,
		breakdownSeconds: { ...breakdown },
		approvedMinutes: toLegacyMinutes(approvedSeconds),
		breakdown: {
			hackatime: minutes.hackatime,
			journals: minutes.journals,
			lapse: minutes.lapse,
			program: minutes.program
		}
	};
}

export const decisionVerb = {
	approved: 'Approved',
	changes: 'Requested changes on',
	rejected: 'Rejected'
} as const;

export const decisionKind = {
	approved: 'APPROVED',
	changes: 'CHANGES',
	rejected: 'REJECTED'
} as const;

export type ReportedSeconds = {
	approvedSeconds: number;
	breakdown: SourceSeconds;
	collaborators: Record<string, PersonSeconds>;
};
