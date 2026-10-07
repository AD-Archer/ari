import { privateProvider } from '$private';
import { getProgram, listActivity, listPrograms, programStats } from './programs';
import {
	findMaker,
	getSubmission,
	listSubmissions,
	searchSubmissions,
	submissionEvidence
} from './submissions';
import { listReviews, reviewerStats } from './reviews';
import { getUser, listUsers, whoami } from './members';
import { addMember, removeMember, setOrgPermissions } from './memberWrites';
import { requeueSubmission } from './requeue';
import { createProgramTool, updateProgramTool } from './programWrites';
import {
	getProgramSettings,
	rollIngestSecretTool,
	rollOutboundSecretTool,
	setReviewTools,
	updateProgramSettings,
	uploadProgramImage
} from './programSettings';
import type { Tool, ToolSpec } from './shared';

export type { Tool, ToolSpec } from './shared';

const tools: Tool[] = [
	listPrograms,
	programStats,
	listSubmissions,
	getSubmission,
	listReviews,
	listUsers,
	searchSubmissions,
	whoami,
	getUser,
	getProgram,
	listActivity,
	submissionEvidence,
	findMaker,
	reviewerStats,
	getProgramSettings,
	addMember,
	removeMember,
	setOrgPermissions,
	requeueSubmission,
	createProgramTool,
	updateProgramTool,
	updateProgramSettings,
	setReviewTools,
	uploadProgramImage,
	rollIngestSecretTool,
	rollOutboundSecretTool,
	...privateProvider.mcpTools()
];

export const mcpTools: Record<string, Tool> = Object.fromEntries(
	tools.map((tool) => [tool.spec.name, tool])
);

export function listToolSpecs(canWrite: boolean): ToolSpec[] {
	return tools.filter((tool) => canWrite || !tool.write).map((tool) => tool.spec);
}
