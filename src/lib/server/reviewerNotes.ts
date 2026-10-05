import { db } from '$lib/server/db';
import { hasOrgPermission, isAnyPoc } from '$lib/server/authz';
import { systemUserId } from '$lib/server/systemUser';
import type { MemberResult } from '$lib/server/members';

const refuse = (status: number, error: string): MemberResult => ({ ok: false, status, error });

export interface ReviewerNoteRow {
	id: string;
	body: string;
	authorId: string;
	authorName: string;
	authorColor: string;
	authorSlackId: string | null;
	createdAt: Date;
}

// notes are org-wide: any poc of any program, or an org operator. null means not allowed to look
export async function listReviewerNotes(
	viewer: App.SessionUser,
	subjectId: string
): Promise<ReviewerNoteRow[] | null> {
	if (!isAnyPoc(viewer)) return null;
	const notes = await db.reviewerNote.findMany({
		where: { subjectId },
		orderBy: { createdAt: 'desc' },
		include: { author: { select: { name: true, avatarColor: true, slackId: true } } }
	});
	return notes.map((note) => ({
		id: note.id,
		body: note.body,
		authorId: note.authorId,
		authorName: note.author.name,
		authorColor: note.author.avatarColor,
		authorSlackId: note.author.slackId,
		createdAt: note.createdAt
	}));
}

export async function addReviewerNote(
	actor: App.SessionUser,
	subjectId: string,
	rawBody: string
): Promise<MemberResult> {
	if (!isAnyPoc(actor)) return refuse(403, 'Only POCs and org operators can add notes.');
	const body = rawBody.trim().slice(0, 4000); // note length cap, matches the textarea maxlength
	if (!body) return refuse(400, 'A note cannot be empty.');
	const subject = await db.user.findUnique({ where: { id: subjectId }, select: { id: true } });
	if (!subject || subject.id === systemUserId) return refuse(404, 'Unknown reviewer.');
	await db.reviewerNote.create({ data: { subjectId: subject.id, authorId: actor.id, body } });
	return { ok: true };
}

export async function deleteReviewerNote(
	actor: App.SessionUser,
	noteId: string
): Promise<MemberResult> {
	if (!isAnyPoc(actor)) return refuse(403, 'Only POCs and org operators can delete notes.');
	if (!noteId) return refuse(400, 'Missing note id.');
	const note = await db.reviewerNote.findUnique({
		where: { id: noteId },
		select: { authorId: true }
	});
	// already gone
	if (!note) return { ok: true };
	if (note.authorId !== actor.id && !hasOrgPermission(actor, 'OPERATE_ALL_PROGRAMS')) {
		return refuse(403, 'You can only delete your own notes.');
	}
	await db.reviewerNote.delete({ where: { id: noteId } });
	return { ok: true };
}
