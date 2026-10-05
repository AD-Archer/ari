import type { OrgPermission, ProgramPermission, Evidence, Track } from '../generated/prisma/client';

declare global {
	namespace App {
		interface SessionUser {
			id: string;
			email: string;
			name: string;
			namePending: boolean;
			avatarColor: string;
			slackId: string | null;
			orgPermissions: OrgPermission[];
			memberships: {
				programId: string;
				permissions: ProgramPermission[];
				isPoc: boolean;
				tracks: Track[];
			}[];
		}

		interface Locals {
			user: SessionUser | null;
			sessionId: string | null;
		}
		interface PageData {
			user?: SessionUser | null;
			program?: string;
			programId?: string;
			permissions?: ProgramPermission[];
			isPoc?: boolean;
			orgWide?: boolean;
			meta?: {
				color: string;
				iconUrl: string | null;
				cardBgUrl: string | null;
				accepts: Evidence[];
				locked: boolean;
				allowVms: boolean;
				secondPass: boolean;
				secondPassOrganizerBypass: boolean;
				excludeOwnProjects: boolean;
				allowDeflation: boolean;
				hoursJustification: boolean;
				reauthRequired: boolean;
				reauthTtlMinutes: number;
				reviewGoal: number;
			};
			pending?: number;
			secondPassPending?: number;
			privateOverlay?: Record<string, unknown> | null;
			privateTabs?: import('$lib/privateApi').NavTab[];
			assignedPrograms?: {
				name: string;
				id: string;
				color: string;
				iconUrl: string | null;
				cardBgUrl: string | null;
				pending: number;
			}[];
		}
	}
}

export {};
