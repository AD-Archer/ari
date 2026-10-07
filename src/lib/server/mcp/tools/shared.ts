import { db } from '$lib/server/db';
import { hasPermission } from '$lib/server/authz';
import type { McpContext } from '../auth';

export interface ToolSpec {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface Tool {
	spec: ToolSpec;
	write?: boolean;
	handler: (args: Record<string, unknown>, context: McpContext) => Promise<unknown>;
}

export function requireWrite(context: McpContext): void {
	if (!context.canWrite) {
		throw new Error('This token is read-only. Mint a read-write token to use write tools.');
	}
}

export function requireProgramSettings(context: McpContext, programId: string): void {
	requireWrite(context);
	if (!hasPermission(context.user, programId, 'MANAGE_SETTINGS')) {
		throw new Error('The token owner cannot manage settings for this program.');
	}
}

export function unwrap<Result extends { ok: boolean }>(
	result: Result
): Extract<Result, { ok: true }> {
	if (!result.ok) throw new Error((result as { error?: string }).error ?? 'The request failed.');
	return result as Extract<Result, { ok: true }>;
}

export const submissionStatuses = [
	'pending',
	'approved',
	'changes',
	'rejected',
	'reverted',
	'processing',
	'withdrawn',
	'secondpass'
] as const;

export async function resolveProgram(reference: string) {
	const program = await db.program.findUnique({
		where: { id: reference },
		select: { id: true, name: true, status: true }
	});
	if (!program) throw new Error(`No program matches "${reference}" (try list_programs).`);
	return program;
}

export function clampLimit(input: unknown, fallback = 25, max = 100): number {
	const value = typeof input === 'number' && Number.isFinite(input) ? Math.floor(input) : fallback;
	return Math.min(Math.max(value, 1), max);
}

export function personWhere(args: Record<string, unknown>): {
	email: string | null;
	slackId: string | null;
	name: string | null;
	conditions: Record<string, unknown>[];
} {
	const email = args.email ? String(args.email).trim().toLowerCase() : null;
	const slackId = args.slackId ? String(args.slackId).trim() : null;
	const name = args.name ? String(args.name).trim() : null;
	if (!email && !slackId && !name)
		throw new Error('Provide at least one of email, slackId, or name.');
	const conditions: Record<string, unknown>[] = [];
	if (email) conditions.push({ email });
	if (slackId) conditions.push({ slackId });
	if (name) conditions.push({ name: { contains: name, mode: 'insensitive' } });
	return { email, slackId, name, conditions };
}

export const personInput = {
	email: { type: 'string', description: 'Exact email (case-insensitive).' },
	slackId: { type: 'string', description: 'Exact Slack user id.' },
	name: { type: 'string', description: 'Case-insensitive substring of the name.' }
};
