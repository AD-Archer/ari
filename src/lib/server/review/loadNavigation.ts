import type { Track } from '$db';
import type { ReviewNavigation } from '$lib/review/reviewTypes';
import { selfReviewWhere, trackAllowed, trackScope, trackWhere } from '$lib/server/authz';
import { claimStaleBefore } from '$lib/server/claims';
import { db } from '$lib/server/db';

interface NavigationInput {
	user: App.SessionUser;
	programId: string;
	excludeOwnProjects: boolean;
	ship: { id: string; status: string; priority: boolean; queuedAt: Date };
	trackParam: string | null;
}

// previous and next step through the list this ship belongs to: the held set for a held
// ship, the open queue otherwise
export async function shipNavigation(input: NavigationInput): Promise<ReviewNavigation> {
	const { user, programId, ship } = input;
	const held = ship.status === 'secondpass';
	// the list's track filter only ever narrows within the reviewer's own scope
	const scope = trackScope(user, programId);
	const filterTrack: Track | null =
		input.trackParam === 'software' || input.trackParam === 'hardware' ? input.trackParam : null;
	const navigationScope = filterTrack && trackAllowed(scope, filterTrack) ? [filterTrack] : scope;

	const queue = await db.submission.findMany({
		where: {
			programId,
			status: { in: held ? ['secondpass'] : ['pending'] },
			...trackWhere(navigationScope),
			...selfReviewWhere(user, input.excludeOwnProjects, programId),
			// stepping onto a ship someone else holds live would only bounce back
			...(held
				? {}
				: {
						OR: [
							{ claimedById: null },
							{ claimedById: user.id },
							{ claimedAt: { lt: claimStaleBefore() } }
						]
					})
		},
		orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
		select: {
			id: true,
			queuedAt: true,
			priority: true,
			reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }
		}
	});

	// held ships go priority first, then oldest held, matching the second-pass list
	const heldAt = (entry: (typeof queue)[number]) =>
		entry.reviews[0]?.createdAt.getTime() ?? entry.queuedAt.getTime();
	const ordered = held
		? [...queue].sort((first, second) =>
				first.priority !== second.priority
					? first.priority
						? -1
						: 1
					: heldAt(first) - heldAt(second)
			)
		: queue;
	const ids = ordered.map((entry) => entry.id);
	const index = ids.indexOf(ship.id);

	// an open ship someone grabbed between two loads sits outside the list: step to its
	// neighbours in queue order instead of dead-ending
	let offListNext: string | null = null;
	let offListPrevious: string | null = null;
	if (index === -1 && ship.status === 'pending') {
		const sortsAfter = (entry: { priority: boolean; queuedAt: Date }) =>
			entry.priority !== ship.priority ? ship.priority : entry.queuedAt > ship.queuedAt;
		const afterAt = ordered.findIndex(sortsAfter);
		offListNext = afterAt >= 0 ? ids[afterAt] : null;
		const before = afterAt >= 0 ? afterAt - 1 : ids.length - 1;
		offListPrevious = before >= 0 ? ids[before] : null;
	}

	return {
		index: index >= 0 ? index : 0,
		total: ids.length,
		inQueue: index >= 0,
		previousId: index > 0 ? ids[index - 1] : index === -1 ? offListPrevious : null,
		nextId: index >= 0 ? (index < ids.length - 1 ? ids[index + 1] : null) : offListNext,
		track: filterTrack
	};
}
