import { db } from '$lib/server/db';
import { queueProgramOrgChannelSync } from '$lib/server/slackChannels';

// archived memberships stop counting toward the org channels, restored ones count again
async function setStatus(programId: string, actorId: string, archive: boolean): Promise<void> {
	const program = await db.program.findUnique({
		where: { id: programId },
		select: { status: true, name: true }
	});
	if (!program || (program.status === 'ARCHIVED') === archive) return;
	const status = archive ? 'ARCHIVED' : 'ACTIVE';
	await db.$transaction([
		db.program.update({ where: { id: programId }, data: { status } }),
		db.activityEvent.create({
			data: {
				programId,
				kind: 'SETTINGS',
				actorId,
				text: `${archive ? 'Archived' : 'Restored'} ${program.name}`,
				meta: {
					sub: 'status',
					op: archive ? 'archive' : 'unarchive',
					from: program.status,
					to: status
				}
			}
		})
	]);
	queueProgramOrgChannelSync(programId);
}

export const archiveProgram = (programId: string, actorId: string) =>
	setStatus(programId, actorId, true);

export const unarchiveProgram = (programId: string, actorId: string) =>
	setStatus(programId, actorId, false);
