import { db } from '$lib/server/db';

// only an approved ship moves the boundary: anything else credited nothing, so its time is
// fair to count once on the re-ship
export async function priorApprovedShipMs(
	programId: string,
	externalId: string,
	before: Date,
	excludeId: string
): Promise<number> {
	const prior = await db.submission.findFirst({
		where: {
			programId,
			externalId,
			status: 'approved',
			id: { not: excludeId },
			receivedAt: { lt: before }
		},
		orderBy: { receivedAt: 'desc' },
		select: { receivedAt: true }
	});
	return prior?.receivedAt.getTime() ?? 0;
}
