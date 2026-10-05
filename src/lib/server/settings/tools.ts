import type { Prisma } from '$db';
import { db } from '$lib/server/db';
import { isStoredId, normalizeTools, validateTools } from '$lib/settingsRules';
import type { SettingsResult } from './save';

function parseList(form: FormData, key: string): unknown {
	try {
		return JSON.parse(String(form.get(key) ?? '[]'));
	} catch {
		return [];
	}
}

const keptIds = (rows: { id: string }[]) =>
	new Set(rows.map((row) => row.id).filter((id) => isStoredId(id)));

export async function saveTools(
	programId: string,
	actorId: string,
	form: FormData
): Promise<SettingsResult> {
	const tools = normalizeTools({
		checklist: parseList(form, 'checklist'),
		fields: parseList(form, 'fields'),
		snippets: parseList(form, 'snippets')
	});
	const error = validateTools(tools);
	if (error) return { ok: false, status: 400, error };
	const { checklist, fields, snippets } = tools;

	// every update and delete is scoped to this program, so a forged id cannot reach another's row
	const [storedChecks, storedFields, storedSnippets] = await Promise.all([
		db.checklistItem.findMany({ where: { programId }, select: { id: true } }),
		db.reviewField.findMany({ where: { programId }, select: { id: true } }),
		db.snippet.findMany({ where: { programId }, select: { id: true } })
	]);
	const checkIds = new Set(storedChecks.map((row) => row.id));
	const fieldIds = new Set(storedFields.map((row) => row.id));
	const snippetIds = new Set(storedSnippets.map((row) => row.id));
	const keptChecks = keptIds(checklist);
	const keptFields = keptIds(fields);
	const keptSnippets = keptIds(snippets);

	const droppedChecks = [...checkIds].filter((id) => !keptChecks.has(id));
	const droppedFields = [...fieldIds].filter((id) => !keptFields.has(id));
	const droppedSnippets = [...snippetIds].filter((id) => !keptSnippets.has(id));

	const operations: Prisma.PrismaPromise<unknown>[] = [
		...droppedChecks.map((id) => db.checklistItem.deleteMany({ where: { id, programId } })),
		...droppedFields.map((id) => db.reviewField.deleteMany({ where: { id, programId } })),
		...droppedSnippets.map((id) => db.snippet.deleteMany({ where: { id, programId } })),
		...checklist.map((item, order) => {
			const data = { label: item.label, tracks: item.tracks, order };
			return checkIds.has(item.id)
				? db.checklistItem.updateMany({ where: { id: item.id, programId }, data })
				: db.checklistItem.create({ data: { programId, ...data } });
		}),
		...fields.map((field, order) => {
			const data = {
				type: field.type,
				label: field.label,
				description: field.description,
				key: field.key,
				options: field.options,
				required: field.required,
				tracks: field.tracks,
				order
			};
			return fieldIds.has(field.id)
				? db.reviewField.updateMany({ where: { id: field.id, programId }, data })
				: db.reviewField.create({ data: { programId, ...data } });
		}),
		...snippets.map((snippet) => {
			const data = { name: snippet.name, body: snippet.body };
			return snippetIds.has(snippet.id)
				? db.snippet.updateMany({ where: { id: snippet.id, programId }, data })
				: db.snippet.create({ data: { programId, ...data } });
		}),
		db.activityEvent.create({
			data: {
				programId,
				kind: 'SETTINGS',
				actorId,
				text: 'Updated reviewer tools',
				meta: {
					sub: 'tools',
					checklist: checklist.length,
					fields: fields.length,
					snippets: snippets.length,
					added:
						checklist.filter((item) => !checkIds.has(item.id)).length +
						fields.filter((field) => !fieldIds.has(field.id)).length +
						snippets.filter((snippet) => !snippetIds.has(snippet.id)).length,
					removed: droppedChecks.length + droppedFields.length + droppedSnippets.length
				}
			}
		})
	];

	try {
		await db.$transaction(operations);
	} catch (caught) {
		// a rename collided with a kept row on the unique (programId, name)
		if ((caught as { code?: string })?.code === 'P2002') {
			return { ok: false, status: 400, error: 'Two snippets ended up with the same name.' };
		}
		throw caught;
	}
	return { ok: true };
}
