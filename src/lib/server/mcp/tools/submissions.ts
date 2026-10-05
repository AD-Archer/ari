import { db } from '$lib/server/db';
import { shipAuthorName } from '$lib/server/serialize';
import type { SubmissionStatus, Track } from '$db';
import {
	clampLimit,
	personInput,
	personWhere,
	resolveProgram,
	submissionStatuses,
	type Tool
} from './shared';

export const listSubmissions: Tool = {
	spec: {
		name: 'list_submissions',
		description:
			'List submissions (ships) for a program, newest first. Optionally filter by status and/or track. Returns summary rows; use get_submission for full detail.',
		inputSchema: {
			type: 'object',
			properties: {
				program: { type: 'string', description: 'Program id.' },
				status: {
					type: 'string',
					enum: [...submissionStatuses],
					description: 'Optional status filter.'
				},
				track: { type: 'string', enum: ['software', 'hardware'] },
				limit: { type: 'number', description: 'Max rows (1-100, default 25).' }
			},
			required: ['program'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const program = await resolveProgram(String(args.program));
		const rows = await db.submission.findMany({
			where: {
				programId: program.id,
				...(args.status ? { status: args.status as SubmissionStatus } : {}),
				...(args.track ? { track: args.track as Track } : {})
			},
			orderBy: { ingestedAt: 'desc' },
			take: clampLimit(args.limit),
			select: {
				id: true,
				title: true,
				status: true,
				track: true,
				version: true,
				claimedHours: true,
				repoUrl: true,
				demoUrl: true,
				receivedAt: true,
				ingestedAt: true,
				authorNameOverrides: true,
				maker: { select: { email: true, name: true, slackId: true } },
				claimedBy: { select: { name: true, email: true } },
				_count: { select: { flags: true } }
			}
		});
		return rows.map((row) => ({
			...row,
			maker: shipAuthorName(row, row.maker),
			makerEmail: row.maker.email,
			makerSlackId: row.maker.slackId,
			claimedBy: row.claimedBy?.name ?? null,
			flags: row._count.flags,
			_count: undefined
		}));
	}
};

export const getSubmission: Tool = {
	spec: {
		name: 'get_submission',
		description:
			'Full detail for one submission: maker, collaborators, verified-hours breakdown, flags, evidence counts, and decision history.',
		inputSchema: {
			type: 'object',
			properties: { id: { type: 'string', description: 'Submission id.' } },
			required: ['id'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const submission = await db.submission.findUnique({
			where: { id: String(args.id) },
			include: {
				maker: { select: { email: true, name: true } },
				program: { select: { id: true, name: true } },
				hours: true,
				flags: {
					select: {
						kind: true,
						severity: true,
						title: true,
						what: true,
						action: true,
						dismissedAt: true
					}
				},
				collaborators: {
					orderBy: { id: 'asc' },
					select: {
						makerId: true,
						hackatimeMinutes: true,
						hackatimeSeconds: true,
						devlogMinutes: true,
						devlogSeconds: true,
						lapseMinutes: true,
						lapseSeconds: true,
						afterLastCommitMinutes: true,
						afterLastCommitSeconds: true,
						programMinutes: true,
						programSeconds: true,
						maker: { select: { email: true, name: true } }
					}
				},
				reviews: {
					orderBy: { createdAt: 'desc' },
					select: {
						decision: true,
						noteToMaker: true,
						collaboratorNotes: true,
						auditNote: true,
						technicalFeatures: true,
						deflationReason: true,
						approvedMinutes: true,
						approvedSeconds: true,
						deflateMinutes: true,
						deflateSeconds: true,
						collaboratorDeflates: true,
						collaboratorDeflatesSeconds: true,
						createdAt: true,
						reviewer: { select: { name: true, email: true } }
					}
				},
				_count: { select: { commits: true, devlogs: true, clips: true } }
			}
		});
		if (!submission) throw new Error(`No submission with id "${args.id}".`);
		return {
			...submission,
			maker: { ...submission.maker, name: shipAuthorName(submission, submission.maker) },
			collaborators: submission.collaborators.map((collaborator) => ({
				...collaborator,
				maker: {
					...collaborator.maker,
					name: shipAuthorName(submission, collaborator.maker)
				}
			})),
			evidence: submission._count,
			_count: undefined
		};
	}
};

export const searchSubmissions: Tool = {
	spec: {
		name: 'search_submissions',
		description:
			'Find submissions whose title, repo URL, maker email, maker name, or maker Slack id contains the query (case-insensitive). Optionally scope to one program.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Substring to match.' },
				program: { type: 'string', description: 'Optional program id.' },
				limit: { type: 'number', description: 'Max rows (1-100, default 25).' }
			},
			required: ['query'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const query = String(args.query);
		const programId = args.program ? (await resolveProgram(String(args.program))).id : undefined;
		return db.submission.findMany({
			where: {
				...(programId ? { programId } : {}),
				OR: [
					{ title: { contains: query, mode: 'insensitive' } },
					{ repoUrl: { contains: query, mode: 'insensitive' } },
					{ maker: { email: { contains: query, mode: 'insensitive' } } },
					{ maker: { name: { contains: query, mode: 'insensitive' } } },
					{ maker: { slackId: { contains: query, mode: 'insensitive' } } }
				]
			},
			orderBy: { ingestedAt: 'desc' },
			take: clampLimit(args.limit),
			select: {
				id: true,
				title: true,
				status: true,
				track: true,
				repoUrl: true,
				programId: true,
				maker: { select: { email: true, name: true, slackId: true } }
			}
		});
	}
};

export const submissionEvidence: Tool = {
	spec: {
		name: 'submission_evidence',
		description:
			'The raw evidence captured for a submission: commits (hash, message, author, churn), devlog entries, and elapsed/lapse clips.',
		inputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string', description: 'Submission id.' },
				limit: { type: 'number', description: 'Max rows per kind (1-100, default 50).' }
			},
			required: ['id'],
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const id = String(args.id);
		const take = clampLimit(args.limit, 50);
		const submission = await db.submission.findUnique({ where: { id }, select: { id: true } });
		if (!submission) throw new Error(`No submission with id "${id}".`);
		const [commits, devlogs, clips] = await Promise.all([
			db.commit.findMany({
				where: { submissionId: id },
				orderBy: { committedAt: 'desc' },
				take,
				select: {
					hash: true,
					message: true,
					committedAt: true,
					additions: true,
					deletions: true,
					authorName: true,
					authorEmail: true
				}
			}),
			db.devlog.findMany({
				where: { submissionId: id },
				orderBy: { at: 'desc' },
				take,
				select: { at: true, minutes: true, seconds: true, text: true, hasImage: true }
			}),
			db.elapsedClip.findMany({
				where: { submissionId: id },
				orderBy: { at: 'desc' },
				take,
				select: { at: true, lengthSeconds: true, note: true, url: true }
			})
		]);
		return { commits, devlogs, clips };
	}
};

export const findMaker: Tool = {
	spec: {
		name: 'find_maker',
		description:
			"Find a maker (ship submitter) by email, Slack id, or name, and list every ship they're on across all programs, both as primary maker and as a collaborator. If more than one maker matches (e.g. a name fragment), returns the candidate list instead so you can narrow down.",
		inputSchema: {
			type: 'object',
			properties: {
				...personInput,
				limit: { type: 'number', description: 'Max ships per maker (1-100, default 50).' }
			},
			additionalProperties: false
		}
	},
	handler: async (args) => {
		const { conditions } = personWhere(args);
		const candidates = await db.maker.findMany({
			where: { OR: conditions },
			take: 25, // enough candidates to narrow a name fragment, never the whole table
			select: {
				id: true,
				email: true,
				name: true,
				slackId: true,
				hackatimeUserId: true,
				_count: { select: { submissions: true, collaborations: true } }
			}
		});
		if (candidates.length === 0) throw new Error('No maker matches that email, Slack id, or name.');
		if (candidates.length > 1) {
			return {
				matches: candidates.length,
				note: 'Multiple makers matched. Narrow by email or slackId to get ships.',
				candidates: candidates.map((candidate) => ({
					id: candidate.id,
					email: candidate.email,
					name: candidate.name,
					slackId: candidate.slackId,
					ships: candidate._count.submissions,
					collaborations: candidate._count.collaborations
				}))
			};
		}

		const maker = candidates[0];
		const take = clampLimit(args.limit, 50);
		const shipSelect = {
			id: true,
			title: true,
			status: true,
			track: true,
			version: true,
			claimedHours: true,
			repoUrl: true,
			receivedAt: true,
			ingestedAt: true,
			program: { select: { id: true, name: true } },
			_count: { select: { flags: true } }
		} as const;
		const [ships, collaborations] = await Promise.all([
			db.submission.findMany({
				where: { makerId: maker.id },
				orderBy: { ingestedAt: 'desc' },
				take,
				select: shipSelect
			}),
			db.submissionCollaborator.findMany({
				where: { makerId: maker.id },
				take,
				select: {
					hackatimeMinutes: true,
					hackatimeSeconds: true,
					devlogMinutes: true,
					devlogSeconds: true,
					lapseMinutes: true,
					lapseSeconds: true,
					submission: { select: shipSelect }
				}
			})
		]);
		const shapeShip = (ship: {
			program: { id: string; name: string };
			_count: { flags: number };
		}) => ({
			...ship,
			program: ship.program.id,
			programName: ship.program.name,
			flags: ship._count.flags,
			_count: undefined
		});
		return {
			maker: {
				id: maker.id,
				email: maker.email,
				name: maker.name,
				slackId: maker.slackId,
				hackatimeUserId: maker.hackatimeUserId
			},
			ships: ships.map(shapeShip),
			collaboratorOn: collaborations.map((collaboration) => ({
				...shapeShip(collaboration.submission),
				hackatimeMinutes: collaboration.hackatimeMinutes,
				hackatimeSeconds: collaboration.hackatimeSeconds,
				devlogMinutes: collaboration.devlogMinutes,
				devlogSeconds: collaboration.devlogSeconds,
				lapseMinutes: collaboration.lapseMinutes,
				lapseSeconds: collaboration.lapseSeconds
			}))
		};
	}
};
