import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { db } from '$lib/server/db';
import { allPermissions, type OrgPermission } from '$lib/data';
import { systemUserId } from '$lib/server/systemUser';
import { addReviewerNote, deleteReviewerNote, listReviewerNotes } from './reviewerNotes';

const prefix = `reviewerNotesTest${Date.now()}${Math.floor(Math.random() * 1000000)}`;
const programId = `${prefix}Program`;
const subjectId = `${prefix}Subject`;

function actorWith(
	name: string,
	orgPermissions: OrgPermission[],
	membership: { isPoc: boolean } | null
): App.SessionUser {
	return {
		id: `${prefix}${name}`,
		email: `${prefix.toLowerCase()}.${name}@example.com`,
		name,
		namePending: false,
		avatarColor: '#338eda',
		slackId: null,
		orgPermissions,
		memberships: membership
			? [
					{
						programId,
						// every program permission without being the poc still is not enough
						permissions: membership.isPoc ? [] : allPermissions,
						isPoc: membership.isPoc,
						tracks: ['software']
					}
				]
			: []
	};
}

const poc = actorWith('poc', [], { isPoc: true });
const otherPoc = actorWith('otherPoc', [], { isPoc: true });
const operator = actorWith('operator', ['OPERATE_ALL_PROGRAMS'], null);
const manager = actorWith('manager', [], { isPoc: false });
const orgViewer = actorWith('orgViewer', ['VIEW_ALL_PROGRAMS', 'MANAGE_PEOPLE'], null);

const notesInDb = () =>
	db.reviewerNote.findMany({ where: { subjectId }, select: { id: true, body: true } });

async function seedNote(author: App.SessionUser, body = 'kept an eye on this one') {
	const note = await db.reviewerNote.create({ data: { subjectId, authorId: author.id, body } });
	return note.id;
}

beforeAll(async () => {
	await db.user.createMany({
		data: [
			...[poc, otherPoc, operator, manager, orgViewer].map((actor) => ({
				id: actor.id,
				email: actor.email,
				name: actor.name,
				avatarColor: actor.avatarColor
			})),
			{
				id: subjectId,
				email: `${prefix.toLowerCase()}.subject@example.com`,
				name: 'Subject',
				avatarColor: '#338eda'
			}
		]
	});
});

beforeEach(async () => {
	await db.reviewerNote.deleteMany({ where: { subjectId } });
});

afterAll(async () => {
	await db.reviewerNote.deleteMany({ where: { subjectId } });
	await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
});

test('a viewer who is neither a poc nor an org operator cannot read notes', async () => {
	await seedNote(poc);
	for (const viewer of [manager, orgViewer]) {
		expect(await listReviewerNotes(viewer, subjectId)).toBeNull();
	}
});

test('a viewer who is neither a poc nor an org operator cannot write notes', async () => {
	const noteId = await seedNote(manager);
	for (const actor of [manager, orgViewer]) {
		expect(await addReviewerNote(actor, subjectId, 'should not land')).toEqual({
			ok: false,
			status: 403,
			error: 'Only POCs and org operators can add notes.'
		});
		// even their own note: the gate comes before the authorship rule
		expect(await deleteReviewerNote(actor, noteId)).toEqual({
			ok: false,
			status: 403,
			error: 'Only POCs and org operators can delete notes.'
		});
	}
	expect(await notesInDb()).toEqual([{ id: noteId, body: 'kept an eye on this one' }]);
});

test('a poc of any program and an org operator read and add notes', async () => {
	expect(await addReviewerNote(poc, subjectId, '  first note  ')).toEqual({ ok: true });
	expect(await addReviewerNote(operator, subjectId, 'second note')).toEqual({ ok: true });
	for (const viewer of [poc, otherPoc, operator]) {
		const notes = await listReviewerNotes(viewer, subjectId);
		expect(notes?.map((note) => note.body).sort()).toEqual(['first note', 'second note']);
	}
	const first = (await listReviewerNotes(poc, subjectId))?.find(
		(note) => note.body === 'first note'
	);
	expect(first?.authorId).toBe(poc.id);
	expect(first?.authorName).toBe('poc');
});

test('an empty note, an unknown subject and the system account are refused', async () => {
	expect(await addReviewerNote(poc, subjectId, '   ')).toEqual({
		ok: false,
		status: 400,
		error: 'A note cannot be empty.'
	});
	for (const target of [`${prefix}Nobody`, systemUserId]) {
		expect(await addReviewerNote(poc, target, 'hello')).toEqual({
			ok: false,
			status: 404,
			error: 'Unknown reviewer.'
		});
	}
	expect(await notesInDb()).toEqual([]);
});

test('a note is cut at 4000 characters', async () => {
	await addReviewerNote(poc, subjectId, 'x'.repeat(4500));
	expect((await notesInDb())[0].body.length).toBe(4000);
});

test('only the author or an org operator deletes a note', async () => {
	const noteId = await seedNote(poc);
	expect(await deleteReviewerNote(otherPoc, noteId)).toEqual({
		ok: false,
		status: 403,
		error: 'You can only delete your own notes.'
	});
	expect(await notesInDb()).toHaveLength(1);

	expect(await deleteReviewerNote(poc, noteId)).toEqual({ ok: true });
	expect(await notesInDb()).toEqual([]);

	const secondId = await seedNote(poc);
	expect(await deleteReviewerNote(operator, secondId)).toEqual({ ok: true });
	expect(await notesInDb()).toEqual([]);

	// already gone is a success, and a missing id is not
	expect(await deleteReviewerNote(poc, secondId)).toEqual({ ok: true });
	expect((await deleteReviewerNote(poc, '')).ok).toBe(false);
});
