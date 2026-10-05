import type { Track } from '$db';
import type { ActionOutcome, ShipEditResult } from '$lib/review/reviewTypes';
import { hasPermission, isSelfReview } from '$lib/server/authz';
import { canActOnSubmission, claimStaleBefore } from '$lib/server/claims';
import { db } from '$lib/server/db';
import { uploadImage } from '$lib/server/imageUpload';
import {
	buildShipSnapshot,
	dispatchShipUpdatedWebhook,
	type ShipEditChange
} from '$lib/server/outbound';
import { shipAuthorName } from '$lib/server/serialize';
import { triggerReenrich } from '$lib/server/webhooks';
import {
	assertAccess,
	assertTrack,
	done,
	lockedRefusal,
	refuse,
	selfReviewRefusal
} from '$lib/server/review/guards';

function editableHttpUrl(
	raw: string,
	label: string,
	required: boolean
): { value: string | null } | { error: string } {
	const value = raw.trim();
	if (!value) return required ? { error: `${label} is required.` } : { value: null };
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
			return { error: `${label} must use http or https.` };
		return { value };
	} catch {
		return { error: `${label} must be a valid URL.` };
	}
}

const sameStrings = (first: string[], second: string[]): boolean =>
	first.length === second.length && first.every((value, index) => value === second[index]);

const invalid = (message: string) => refuse(400, 'invalid', message);

// editing and uploading share one gate: the ship is pending and this reviewer may act on it
async function editableShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	closedMessage: string
) {
	assertAccess(user, programId);
	const ship = await db.submission.findFirst({
		where: { id: submissionId, programId },
		include: {
			maker: true,
			collaborators: { include: { maker: true }, orderBy: { id: 'asc' } },
			program: { select: { reviewersCannotReviewOwnProjects: true } }
		}
	});
	if (!ship) return { ship: null, refusal: refuse(404, 'notFound', 'Submission not found.') };
	assertTrack(user, programId, ship.track);
	if (ship.program.reviewersCannotReviewOwnProjects && isSelfReview(user, ship, programId))
		return { ship: null, refusal: selfReviewRefusal() };
	if (ship.status !== 'pending')
		return { ship: null, refusal: refuse(409, 'shipClosed', closedMessage) };
	if (!(await canActOnSubmission(ship.id, user.id)))
		return { ship: null, refusal: lockedRefusal() };
	return { ship, refusal: null };
}

export async function uploadShipImage(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	form: FormData
): Promise<ActionOutcome<{ url: string }>> {
	const gate = await editableShip(
		user,
		programId,
		submissionId,
		'Only a ship waiting for review can upload a thumbnail.'
	);
	if (!gate.ship) return gate.refusal;
	const upload = await uploadImage(form.get('file'));
	if (!upload.ok) return refuse(upload.status, 'uploadFailed', upload.error);
	return done({ url: upload.url });
}

export async function editShip(
	user: App.SessionUser,
	programId: string,
	submissionId: string,
	form: FormData
): Promise<ActionOutcome<ShipEditResult>> {
	const gate = await editableShip(
		user,
		programId,
		submissionId,
		'Only a ship waiting for review can be edited.'
	);
	if (!gate.ship) return gate.refusal;
	const ship = gate.ship;

	const title = String(form.get('title') ?? '').trim();
	const trackInput = String(form.get('track') ?? '');
	if (trackInput !== 'software' && trackInput !== 'hardware')
		return invalid('Ship type must be software or hardware.');
	const track: Track = trackInput;
	if (track !== ship.track && !hasPermission(user, programId, 'OVERRIDE_DECISIONS'))
		return refuse(403, 'trackPermission', 'You do not have permission to change the ship type.');
	const description = String(form.get('description') ?? '').trim();
	if (!title) return invalid('Ship title is required.');
	// 200 characters: a chosen cap, not derived
	if (title.length > 200) return invalid('Ship title must be 200 characters or less.');
	if (!description) return invalid('Ship description is required.');
	// 5,000 characters: a chosen cap, not derived
	if (description.length > 5000)
		return invalid('Ship description must be 5,000 characters or less.');

	const repo = editableHttpUrl(String(form.get('repoUrl') ?? ''), 'Repository URL', true);
	if ('error' in repo) return invalid(repo.error);
	const demo = editableHttpUrl(
		String(form.get('demoUrl') ?? ''),
		'Live demo URL',
		track === 'software'
	);
	if ('error' in demo) return invalid(demo.error);
	const thumbnail = editableHttpUrl(String(form.get('thumbnailUrl') ?? ''), 'Thumbnail URL', false);
	if ('error' in thumbnail) return invalid(thumbnail.error);

	let projectInput: unknown;
	let authorInput: unknown;
	try {
		projectInput = JSON.parse(String(form.get('hackatimeProjects') ?? '[]'));
		authorInput = JSON.parse(String(form.get('authorNames') ?? '{}'));
	} catch {
		return invalid('The edit form contained malformed project or author data.');
	}
	if (!Array.isArray(projectInput) || !projectInput.every((value) => typeof value === 'string'))
		return invalid('Hackatime projects must be a list of names.');
	const hackatimeProjects = [
		...new Set((projectInput as string[]).map((value) => value.trim()).filter(Boolean))
	];
	// 50 projects of 200 characters each: chosen caps, not derived
	if (hackatimeProjects.length > 50 || hackatimeProjects.some((project) => project.length > 200))
		return invalid('Use at most 50 Hackatime projects of 200 characters each.');
	if (!authorInput || typeof authorInput !== 'object' || Array.isArray(authorInput))
		return invalid('Author names must be an object keyed by maker email.');

	const seenEmails = new Set<string>();
	const people = (
		ship.collaborators.length
			? ship.collaborators.map((collaborator) => collaborator.maker)
			: [ship.maker]
	).filter((maker) => {
		const email = maker.email.toLowerCase();
		if (seenEmails.has(email)) return false;
		seenEmails.add(email);
		return true;
	});
	const authorNames: Record<string, string> = {};
	const oldAuthorNames = people.map((maker) => shipAuthorName(ship, maker));
	for (const maker of people) {
		const email = maker.email.toLowerCase();
		const name = (authorInput as Record<string, unknown>)[email];
		if (typeof name !== 'string' || !name.trim())
			return invalid(`An author name is required for ${maker.email}.`);
		// 100 characters: a chosen cap, not derived
		if (name.trim().length > 100) return invalid(`Author name for ${maker.email} is too long.`);
		authorNames[email] = name.trim();
	}
	const newAuthorNames = people.map((maker) => authorNames[maker.email.toLowerCase()]);

	const changes: ShipEditChange[] = [];
	const change = (
		field: string,
		label: string,
		from: string | string[] | null,
		to: string | string[] | null
	) => {
		const equal = Array.isArray(from) && Array.isArray(to) ? sameStrings(from, to) : from === to;
		if (!equal) changes.push({ field, label, from, to });
	};
	change('title', 'Title', ship.title, title);
	change('track', 'Ship type', ship.track, track);
	change('description', 'Description', ship.description, description);
	change('thumbnail_url', 'Thumbnail', ship.thumbnailUrl, thumbnail.value);
	change(
		'author_names',
		people.length === 1 ? 'Author name' : 'Author names',
		oldAuthorNames,
		newAuthorNames
	);
	change('repo_url', 'Repository', ship.repoUrl, repo.value);
	change('demo_url', 'Live demo', ship.demoUrl, demo.value);
	change('hackatime_projects', 'Hackatime projects', ship.hackatimeProjects, hackatimeProjects);
	if (!changes.length) return done({ success: true, unchanged: true });

	const edited = {
		title,
		track,
		description,
		thumbnailUrl: thumbnail.value,
		authorNameOverrides: authorNames,
		repoUrl: repo.value!,
		demoUrl: demo.value,
		hackatimeProjects
	};
	const committed = await db.$transaction(async (transaction) => {
		const updated = await transaction.submission.updateMany({
			where: {
				id: ship.id,
				programId,
				status: 'pending',
				OR: [
					{ claimedById: user.id },
					{ claimedById: null },
					{ claimedAt: { lt: claimStaleBefore() } }
				]
			},
			data: edited
		});
		if (updated.count === 0) return false;
		await transaction.activityEvent.create({
			data: {
				programId,
				kind: 'SHIP_EDIT',
				actorId: user.id,
				submissionId: ship.id,
				text: `Edited ${title}`,
				meta: { changes }
			}
		});
		return true;
	});
	if (!committed)
		return refuse(
			409,
			'claimHeldByOther',
			'This ship changed or was claimed while you were editing it.'
		);

	const webhook = await dispatchShipUpdatedWebhook({
		programId,
		submissionId: ship.id,
		externalId: ship.externalId,
		editorId: user.id,
		changes,
		ship: buildShipSnapshot({ ...ship, ...edited })
	});

	const needsResync = changes.some(
		(entry) => entry.field === 'repo_url' || entry.field === 'hackatime_projects'
	);
	const resync = needsResync ? await triggerReenrich(ship.id) : null;
	return done({
		success: true,
		changed: changes.length,
		webhook,
		resyncQueued: resync?.ok ?? false,
		...(!resync || resync.ok ? {} : { resyncError: resync.message })
	});
}
