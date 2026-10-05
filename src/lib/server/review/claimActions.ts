import { isSelfReview, requirePermission } from '$lib/server/authz';
import { claimSubmission, heartbeatClaim, releaseClaim, takeoverClaim } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { endReauth, touchReauth } from '$lib/server/reauth';
import type { ActionOutcome } from '$lib/review/reviewTypes';
import {
	assertAccess,
	assertTrack,
	done,
	reauthRefusal,
	refuse,
	selfReviewRefusal
} from '$lib/server/review/guards';

// a takeover is a claim that wins over a live holder, so both run the same gates
async function claimGate(user: App.SessionUser, programId: string, submissionId: string) {
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: {
			track: true,
			maker: { select: { email: true, slackId: true } },
			collaborators: { select: { maker: { select: { email: true, slackId: true } } } },
			program: { select: { reviewersCannotReviewOwnProjects: true } }
		}
	});
	if (!ship)
		return { reauthRequired: false, refusal: refuse(404, 'notFound', 'Submission not found.') };
	assertAccess(user, programId);
	assertTrack(user, programId, ship.track);
	if (ship.program.reviewersCannotReviewOwnProjects && isSelfReview(user, ship, programId))
		return { reauthRequired: false, refusal: selfReviewRefusal() };

	// the load redirect is the normal path: this covers a direct post and a grant that lapsed
	const reauth = await reauthRefusal(user, programId, submissionId);
	return { reauthRequired: reauth.required, refusal: reauth.refusal };
}

const closedRefusal = () =>
	refuse(409, 'shipClosed', 'This ship is no longer open for review.', { closed: true });

export async function claimShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string
): Promise<ActionOutcome<{ ok: true }>> {
	const gate = await claimGate(user, programId, submissionId);
	if (gate.refusal) return gate.refusal;

	const claim = await claimSubmission(submissionId, user.id);
	if (claim.ok) {
		// a fresh claim is review activity: the grant slides forward
		if (gate.reauthRequired) await touchReauth(user.id, programId);
		return done({ ok: true });
	}
	if (claim.reason === 'locked')
		return refuse(409, 'claimHeldByOther', `${claim.by.byName} is reviewing this.`, {
			locked: true,
			by: claim.by.byName
		});
	return closedRefusal();
}

// displacing an active reviewer is above a plain reviewer's remit
export async function takeoverShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string
): Promise<ActionOutcome<{ ok: true }>> {
	requirePermission(user, programId, 'OVERRIDE_DECISIONS');
	const gate = await claimGate(user, programId, submissionId);
	if (gate.refusal) return gate.refusal;

	const takeover = await takeoverClaim(submissionId, user.id);
	if (!takeover.ok) return closedRefusal();
	if (gate.reauthRequired) await touchReauth(user.id, programId);
	return done({ ok: true });
}

export async function heartbeatShip(
	user: App.SessionUser | null,
	programId: string,
	submissionId: string
): Promise<{ ok: boolean; lost: boolean }> {
	if (!user) return { ok: false, lost: true };
	const held = await heartbeatClaim(submissionId, user.id);
	// a held heartbeat is active reviewing, so the grant only lapses on real inactivity
	if (held) await touchReauth(user.id, programId);
	return { ok: held, lost: !held };
}

// moving between ships is the same sitting: the reauth grant stays
export async function releaseShip(
	user: App.SessionUser | null,
	submissionId: string
): Promise<{ ok: true }> {
	if (user) await releaseClaim(submissionId, user.id);
	return { ok: true };
}

export async function finishReviewSession(
	user: App.SessionUser | null,
	programId: string,
	submissionId: string
): Promise<{ ok: true }> {
	if (user) {
		await releaseClaim(submissionId, user.id);
		await endReauth(user.id, programId);
	}
	return { ok: true };
}
