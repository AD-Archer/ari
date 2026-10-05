import { db } from '$lib/server/db';
import { hasOrgPermission } from '$lib/server/authz';
import { queueProgramOrgChannelSync } from '$lib/server/slackChannels';
import { triggerReenrichProgram } from '$lib/server/webhooks';
import { notPermitted, refuse, type ProgramResult } from '$lib/server/programs';

async function setArchived(
	actor: App.SessionUser,
	rawProgramId: string,
	archived: boolean
): Promise<ProgramResult<object>> {
	if (!hasOrgPermission(actor, 'MANAGE_PROGRAMS')) return notPermitted();
	const programId = rawProgramId.trim();
	if (!programId) return refuse(400, 'No program specified.');

	const program = await db.program.findUnique({ where: { id: programId } });
	if (!program) return refuse(404, 'Program not found.');
	if ((program.status === 'ARCHIVED') === archived) return { ok: true };

	await db.$transaction([
		db.program.update({
			where: { id: program.id },
			data: { status: archived ? 'ARCHIVED' : 'ACTIVE' }
		}),
		db.activityEvent.create({
			data: {
				programId: program.id,
				kind: 'SETTINGS',
				actorId: actor.id,
				text: `Program ${program.name} ${archived ? 'archived' : 'restored'}`,
				meta: {
					event: archived ? 'program_archived' : 'program_restored',
					name: program.name,
					sub: 'status',
					from: archived ? program.status : 'ARCHIVED',
					to: archived ? 'ARCHIVED' : 'ACTIVE'
				}
			}
		})
	]);
	// archived memberships stop counting toward the org channels, restored ones count again
	queueProgramOrgChannelSync(program.id);
	return { ok: true };
}

export const archiveProgram = (actor: App.SessionUser, programId: string) =>
	setArchived(actor, programId, true);

export const unarchiveProgram = (actor: App.SessionUser, programId: string) =>
	setArchived(actor, programId, false);

// queues the same durable capture jobs as the single-ship resync, for every ship still waiting
export async function reingestProgram(
	actor: App.SessionUser,
	rawProgramId: string
): Promise<ProgramResult<{ queued: number }>> {
	if (!hasOrgPermission(actor, 'MANAGE_PROGRAMS')) return notPermitted();
	const programId = rawProgramId.trim();
	if (!programId) return refuse(400, 'No program specified.');

	const program = await db.program.findUnique({ where: { id: programId } });
	if (!program) return refuse(404, 'Program not found.');

	const triggered = await triggerReenrichProgram(programId);
	if (!triggered.ok) return refuse(502, triggered.message);

	await db.activityEvent.create({
		data: {
			programId: program.id,
			kind: 'SETTINGS',
			actorId: actor.id,
			text: `Re-ingestion started for ${program.name}`,
			meta: { event: 'program_reingest', name: program.name, queued: triggered.queued }
		}
	});
	return { ok: true, queued: triggered.queued };
}
