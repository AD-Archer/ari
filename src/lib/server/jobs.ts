import { db } from '$lib/server/db';

// never throws: a failed enqueue must not fail the decision that called it
export async function enqueueJob(kind: string, submissionId: string): Promise<void> {
	try {
		await db.$executeRaw`
			insert into ariw.job (kind, "submissionId", "runAt")
			values (${kind}, ${submissionId}, now())
			on conflict (kind, "submissionId") where status in ('due', 'running') do nothing`;
	} catch (error) {
		console.error(
			`[jobs] ${kind} enqueue for ${submissionId} failed - is ari-webhooks running?`,
			error
		);
	}
}
