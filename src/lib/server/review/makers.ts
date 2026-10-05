import { error } from '@sveltejs/kit';
import type { MakerInfo } from '$lib/review/reviewTypes';
import { canAccessProgram } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { shipAuthorName } from '$lib/server/serialize';
import { slackProfile } from '$lib/server/slack';
import { assertViewable } from '$lib/server/review/guards';

// fetched when the card opens, so the live slack lookup never slows opening a ship
export async function shipMakers(
	user: App.SessionUser | null,
	programId: string,
	submissionId: string
): Promise<MakerInfo[]> {
	if (!user) throw error(401, 'Sign in first');
	if (!canAccessProgram(user, programId)) throw error(403, "You don't have access to this program");
	const makerSelect = { name: true, email: true, slackId: true, hackatimeUserId: true } as const;
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: {
			track: true,
			status: true,
			authorNameOverrides: true,
			program: { select: { reviewersCannotReviewOwnProjects: true } },
			maker: { select: makerSelect },
			collaborators: { select: { maker: { select: makerSelect } }, orderBy: { id: 'asc' } }
		}
	});
	if (!ship) throw error(404, 'Submission not found');
	assertViewable(user, programId, ship, ship.program.reviewersCannotReviewOwnProjects);

	// a collaborative ship can list the submitting maker among the collaborators too
	const seen = new Set<string>();
	const people = [
		ship.maker,
		...ship.collaborators.map((collaborator) => collaborator.maker)
	].filter((maker) => !seen.has(maker.email) && seen.add(maker.email));
	return Promise.all(
		people.map(async (maker) => {
			const profile = maker.slackId ? await slackProfile(maker.slackId) : null;
			return {
				name: shipAuthorName(ship, maker),
				email: maker.email,
				slackId: maker.slackId,
				hackatimeUserId: maker.hackatimeUserId,
				slackUsername: profile?.username ?? null,
				slackDisplayName: profile?.displayName ?? null
			};
		})
	);
}
