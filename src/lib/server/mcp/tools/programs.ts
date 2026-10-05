import { db } from '$lib/server/db';
import { clampLimit, resolveProgram, submissionStatuses, type Tool } from './shared';

export const listPrograms: Tool = {
	spec: {
		name: 'list_programs',
		description:
			'List every program (hackathon/event) with status, accepted evidence types, and a count of submissions currently awaiting review.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false }
	},
	handler: async () => {
		const programs = await db.program.findMany({
			orderBy: { createdAt: 'desc' },
			select: {
				id: true,
				name: true,
				status: true,
				accepts: true,
				collaborative: true,
				allowVms: true,
				secondPass: true,
				weeklyReviewGoal: true,
				_count: { select: { memberships: true } }
			}
		});
		const pending = await db.submission.groupBy({
			by: ['programId'],
			where: { status: 'pending' },
			_count: true
		});
		const pendingByProgram = new Map(pending.map((group) => [group.programId, group._count]));
		return programs.map((program) => ({
			id: program.id,
			name: program.name,
			status: program.status,
			accepts: program.accepts,
			collaborative: program.collaborative,
			allowVms: program.allowVms,
			secondPass: program.secondPass,
			weeklyReviewGoal: program.weeklyReviewGoal,
			members: program._count.memberships,
			pending: pendingByProgram.get(program.id) ?? 0
		}));
	}
};

export const programStats: Tool = {
	spec: {
		name: 'program_stats',
		description:
			'Submission counts broken down by status for one program, plus reviewer/organizer headcount and the weekly review goal.',
		inputSchema: {
			type: 'object',
			properties: {
				program: { type: 'string', description: 'Program id.' }
			},
			required: ['program'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const program = await resolveProgram(String(args.program));
		const grouped = await db.submission.groupBy({
			by: ['status'],
			where: { programId: program.id },
			_count: true
		});
		const byStatus: Record<string, number> = {};
		for (const status of submissionStatuses) byStatus[status] = 0;
		for (const group of grouped) byStatus[group.status] = group._count;
		const members = await db.membership.findMany({
			where: { programId: program.id },
			select: { permissions: true, isPoc: true, user: { select: { email: true } } }
		});
		return {
			program,
			submissionsByStatus: byStatus,
			total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
			members: members.length,
			operators: members.filter((member) => member.isPoc || member.permissions.length > 0).length,
			poc: members.find((member) => member.isPoc)?.user.email ?? null
		};
	}
};

export const getProgram: Tool = {
	spec: {
		name: 'get_program',
		description:
			'Full configuration for one program: status, accepted evidence, feature flags (collaborative/VMs/second-pass), checklist items, custom review fields, flag rules, and whether an outbound webhook is configured.',
		inputSchema: {
			type: 'object',
			properties: { program: { type: 'string', description: 'Program id.' } },
			required: ['program'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const { id } = await resolveProgram(String(args.program));
		const program = await db.program.findUnique({
			where: { id },
			include: {
				checklist: { orderBy: { order: 'asc' }, select: { order: true, label: true } },
				reviewFields: {
					select: { key: true, type: true, label: true, required: true, options: true }
				},
				flagRules: { select: { kind: true, enabled: true } },
				outboundEndpoint: { select: { url: true, enabled: true, last4: true } },
				_count: { select: { memberships: true, submissions: true, snippets: true } }
			}
		});
		if (!program) throw new Error('Program vanished.');
		return {
			id: program.id,
			name: program.name,
			status: program.status,
			accepts: program.accepts,
			weeklyReviewGoal: program.weeklyReviewGoal,
			collaborative: program.collaborative,
			allowVms: program.allowVms,
			secondPass: program.secondPass,
			checklist: program.checklist,
			reviewFields: program.reviewFields,
			flagRules: program.flagRules,
			outbound: program.outboundEndpoint
				? {
						configured: true,
						enabled: program.outboundEndpoint.enabled,
						url: program.outboundEndpoint.url
					}
				: { configured: false },
			counts: program._count
		};
	}
};

export const listActivity: Tool = {
	spec: {
		name: 'list_activity',
		description:
			'Recent activity-log events for a program (decisions, member changes, settings, webhooks, flags), newest first.',
		inputSchema: {
			type: 'object',
			properties: {
				program: { type: 'string', description: 'Program id.' },
				limit: { type: 'number', description: 'Max rows (1-100, default 30).' }
			},
			required: ['program'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const { id } = await resolveProgram(String(args.program));
		return db.activityEvent.findMany({
			where: { programId: id },
			orderBy: { createdAt: 'desc' },
			take: clampLimit(args.limit, 30),
			select: { kind: true, text: true, createdAt: true, submissionId: true }
		});
	}
};
