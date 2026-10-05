import { error } from '@sveltejs/kit';
import { returnProblems } from '$lib/review/reviewRules';
import type { ActionOutcome } from '$lib/review/reviewTypes';
import { isSelfReview, requirePermission } from '$lib/server/authz';
import { db } from '$lib/server/db';
import { shipAuthorName } from '$lib/server/serialize';
import { draftColumns } from '$lib/server/settlementStore';
import { teardownVms } from '$lib/server/vm';
import {
	assertTrack,
	done,
	refuse,
	refuseProblems,
	selfReviewRefusal,
	shipVmIds
} from '$lib/server/review/guards';
import { storedTimeRequest } from '$lib/server/review/heldReview';

// the held decision is discarded and nothing is sent: the program never heard of it
export async function returnSecondPass(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	form: FormData
): Promise<ActionOutcome<{ success: true; takeover: boolean }>> {
	requirePermission(user, programId, 'SECOND_PASS');
	const reason = String(form.get('reason') ?? '');
	// the organizer keeps the ship to review it fresh, so the held work seeds their draft too
	const takeover = form.get('takeover') === '1';

	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		select: {
			id: true,
			title: true,
			status: true,
			track: true,
			authorNameOverrides: true,
			maker: { select: { name: true, email: true, slackId: true } },
			collaborators: { select: { maker: { select: { email: true, slackId: true } } } },
			program: { select: { reviewersCannotReviewOwnProjects: true } },
			reviews: { orderBy: { createdAt: 'desc' }, take: 1 }
		}
	});
	if (!reason.trim())
		return refuseProblems(
			returnProblems({ reason, status: 'secondpass', viewer: { canSecondPass: true } })
		);
	if (!ship) throw error(404, 'Submission not found');
	assertTrack(user, programId, ship.track);
	if (ship.program.reviewersCannotReviewOwnProjects && isSelfReview(user, ship, programId))
		return selfReviewRefusal();
	const problems = returnProblems({
		reason,
		status: ship.status,
		viewer: { canSecondPass: true }
	});
	if (problems.length) return refuseProblems(problems);

	const vmids = await shipVmIds(ship.id);
	try {
		const returned = await db.$transaction(async (transaction) => {
			const updated = await transaction.submission.updateMany({
				where: { id: ship.id, status: 'secondpass' },
				data: { status: 'pending' }
			});
			if (updated.count === 0) return false;
			await transaction.reviewerVm.deleteMany({ where: { submissionId: ship.id } });

			// the decision deleted the reviewer's draft: a returned ship reopens with their work
			const held = ship.reviews[0];
			if (held) {
				const time = storedTimeRequest(held);
				const perPerson = Object.keys(time.collaboratorDeflates).length > 0;
				const draft = {
					note: held.noteToMaker,
					audit: held.auditNote,
					technicalFeatures: held.technicalFeatures,
					deflationReason: held.deflationReason,
					collaboratorNotes: (held.collaboratorNotes ?? {}) as object,
					fieldValues: held.fieldValues as object,
					checks: held.checklist as object,
					fixChecks: held.fixChecks as object,
					...draftColumns({
						adjustments: time.adjustments,
						// the stored total of per-person cuts is not a flat cut of its own
						deflateSeconds: perPerson ? null : time.deflateSeconds,
						collaboratorDeflates: time.collaboratorDeflates
					})
				};
				const reviewerIds = new Set([held.reviewerId, ...(takeover ? [user.id] : [])]);
				for (const reviewerId of reviewerIds) {
					await transaction.draft.upsert({
						where: { submissionId_reviewerId: { submissionId: ship.id, reviewerId } },
						create: { submissionId: ship.id, reviewerId, ...draft },
						update: draft
					});
				}
			}
			await transaction.activityEvent.create({
				data: {
					programId,
					kind: 'REVERT',
					actorId: user.id,
					submissionId: ship.id,
					text: `Returned ${ship.title} to the queue (second pass): ${reason.trim()}`,
					meta: {
						op: 'second-pass-returned',
						fromStatus: 'secondpass',
						toStatus: 'pending',
						title: ship.title,
						maker: shipAuthorName(ship, ship.maker),
						auditReason: reason.trim(),
						...(takeover ? { takeover: true } : {})
					}
				}
			});
			return true;
		});
		if (!returned)
			return refuse(409, 'notAwaitingSecondPass', 'This ship is no longer awaiting second pass.');
	} catch (caught) {
		// one open ship per project: a newer ship is already on the queue
		if ((caught as { code?: string })?.code === 'P2002')
			return refuse(
				409,
				'newerShipOpen',
				'A newer ship of this project is already open. Decide it before returning this one to the queue.'
			);
		throw caught;
	}

	teardownVms(vmids);
	return done({ success: true, takeover });
}
