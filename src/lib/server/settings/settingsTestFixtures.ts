import { db } from '$lib/server/db';
import { allPermissions } from '$lib/data';

export function formOf(entries: Record<string, string>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(entries)) form.set(key, value);
	return form;
}

export function settingsFixtures(label: string) {
	const prefix = `${label}${Date.now()}${Math.floor(Math.random() * 1000000)}`;
	const programId = `${prefix}Program`;
	const otherProgramId = `${prefix}Other`;

	const actorWith = (
		name: string,
		orgPermissions: App.SessionUser['orgPermissions'],
		memberships: App.SessionUser['memberships']
	): App.SessionUser => ({
		id: `${prefix}${name}`,
		email: `${prefix.toLowerCase()}.${name}@example.com`,
		name,
		namePending: false,
		avatarColor: '#338eda',
		slackId: null,
		orgPermissions,
		memberships
	});

	const organizer = actorWith(
		'organizer',
		[],
		[{ programId, permissions: ['MANAGE_SETTINGS'], isPoc: false, tracks: ['software'] }]
	);
	const member = actorWith(
		'member',
		[],
		[
			{
				programId,
				permissions: allPermissions.filter((permission) => permission !== 'MANAGE_SETTINGS'),
				isPoc: false,
				tracks: ['software', 'hardware']
			}
		]
	);
	const outsider = actorWith('outsider', [], []);
	const orgAdmin = actorWith('orgAdmin', ['MANAGE_PROGRAMS', 'OPERATE_ALL_PROGRAMS'], []);

	return {
		prefix,
		programId,
		otherProgramId,
		organizer,
		member,
		outsider,
		orgAdmin,
		programRow: () => db.program.findUniqueOrThrow({ where: { id: programId } }),
		settingsEvents: () =>
			db.activityEvent.findMany({
				where: { programId, kind: 'SETTINGS' },
				orderBy: { createdAt: 'asc' }
			}),
		async createUsers() {
			await db.user.createMany({
				data: [organizer, member, outsider, orgAdmin].map((actor) => ({
					id: actor.id,
					email: actor.email,
					name: actor.name,
					avatarColor: actor.avatarColor,
					orgPermissions: actor.orgPermissions
				}))
			});
		},
		async cleanUp() {
			await db.activityEvent.deleteMany({
				where: { programId: { in: [programId, otherProgramId] } }
			});
			await db.program.deleteMany({ where: { id: { in: [programId, otherProgramId] } } });
			await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
		}
	};
}
