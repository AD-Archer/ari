import { createCipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../generated/prisma/client';
import { toLegacyMinutes } from '../src/lib/time';
import { seedActivity } from './seedData/activity';
import { seedAccess, seedDeliveries, seedFlags, seedSessions } from './seedData/extras';
import { seedShips } from './seedData/generatedShips';
import { allOrgPermissions, makerById, seedMakers, seedUsers } from './seedData/people';
import { seedReviewPage } from './seedData/reviewPage';
import { seedReview } from './seedData/reviews';
import { daysAgo, recentOrDaysAgo, sumOf } from './seedData/shared';
import { projectSlug, type SeedShip } from './seedData/ships';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(databaseUrl) && process.env.SEED_ANYWAY !== 'true') {
	console.error('Refusing to seed: DATABASE_URL is not a local database.');
	process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const priorityFormToken = 'seedPriorityFormToken0001';

// same aes-256-gcm iv.tag.ciphertext layout as src/lib/server/crypto.ts, which reads the key
// through $env and so cannot be imported here
function encryptSecret(plainText: string): string | null {
	const keyBytes = Buffer.from(process.env.TOKEN_ENC_KEY ?? '', 'base64');
	if (keyBytes.length !== 32) return null; // the cipher needs a 32-byte key
	const initVector = randomBytes(12); // 12: the gcm nonce length crypto.ts uses
	const cipher = createCipheriv('aes-256-gcm', keyBytes, initVector);
	const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
	return [initVector, cipher.getAuthTag(), cipherText]
		.map((part) => part.toString('base64'))
		.join('.');
}

// the raw value is thrown away: the app only ever shows its last four characters
async function seedOutboundSecret() {
	const rawSecret = randomBytes(32).toString('base64url');
	const secretEnc = encryptSecret(rawSecret);
	if (!secretEnc) {
		console.log('TOKEN_ENC_KEY is not set: the outbound endpoint has no signing secret.');
		return;
	}
	await db.outboundEndpoint.update({
		where: { id: 'seedOutboundEndpoint' },
		data: { secretEnc, last4: rawSecret.slice(-4) }
	});
}

async function clearSeedRows() {
	const seedId = { startsWith: 'seed' };
	// invites have no relation to cascade from
	await db.invite.deleteMany({ where: { id: seedId } });
	// programs cascade to submissions, memberships, checklist, activity, deliveries and reviews
	await db.program.deleteMany({ where: { id: seedId } });
	await db.maker.deleteMany({ where: { id: seedId } });
	// users cascade to mcp tokens and reviewer notes
	await db.user.deleteMany({ where: { id: seedId } });
	// a requeue leaves a capture job in the service's schema, when that schema exists
	await db.$executeRaw`delete from ariw.job where "submissionId" like 'seed%'`.catch(() => {});
}

async function seedPeople() {
	await db.user.createMany({
		data: seedUsers.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			avatarColor: user.color,
			nameSource: user.namePending ? ('PENDING' as const) : ('CUSTOM' as const),
			orgPermissions: user.admin ? [...allOrgPermissions] : []
		}))
	});
	await db.maker.createMany({ data: seedMakers });
}

// one field of every type: fields 1 and 4 only on hardware, field 6 only on software
const workbenchFields: Prisma.ReviewFieldCreateWithoutProgramInput[] = [
	{
		order: 0,
		type: 'select',
		label: 'Field 1',
		key: 'field1',
		options: ['Option 1', 'Option 2', 'Option 3'],
		required: true,
		tracks: ['hardware']
	},
	{
		order: 1,
		type: 'checkbox',
		label: 'Field 2',
		description: 'Description of field 2.',
		key: 'field2',
		tracks: ['software', 'hardware']
	},
	{
		order: 2,
		type: 'text',
		label: 'Field 3',
		description: 'Description of field 3.',
		key: 'field3',
		tracks: ['software', 'hardware']
	},
	{
		order: 3,
		type: 'number',
		label: 'Field 4',
		key: 'field4',
		tracks: ['hardware']
	},
	{
		order: 4,
		type: 'multiselect',
		label: 'Field 5',
		key: 'field5',
		options: ['Option 4', 'Option 5', 'Option 6', 'Option 7'],
		tracks: ['software', 'hardware']
	},
	{
		order: 5,
		type: 'text',
		label: 'Field 6',
		description: 'Description of field 6.',
		key: 'field6',
		tracks: ['software']
	}
];

async function seedPrograms() {
	await db.program.create({
		data: {
			id: 'seedProgramSoftware',
			name: 'Program 1',
			color: '#338eda',
			accepts: ['commits', 'devlog', 'elapsed'],
			collaborative: true,
			secondPass: true,
			priorityReview: true,
			priorityReviewToken: priorityFormToken,
			weeklyReviewGoal: 25,
			createdAt: daysAgo(30, 9),
			checklist: {
				create: [
					{ order: 0, label: 'Checklist item 1', tracks: ['software'] },
					{ order: 1, label: 'Checklist item 2', tracks: ['software'] },
					{ order: 2, label: 'Checklist item 3', tracks: ['software'] }
				]
			},
			snippets: {
				create: [
					{ name: 'snippet1', body: 'Snippet body 1.' },
					{ name: 'snippet2', body: 'Snippet body 2.' }
				]
			},
			memberships: {
				create: [
					{ userId: 'seedUserPoc', isPoc: true, tracks: ['software', 'hardware'] },
					{ userId: 'seedUserSoftware', tracks: ['software'] },
					{
						userId: 'seedUserLead',
						tracks: ['software', 'hardware'],
						permissions: ['SECOND_PASS', 'VIEW_AUDIT_LOG', 'VIEW_REVIEWERS']
					},
					{ userId: 'seedUserPending', tracks: ['software'] }
				]
			}
		}
	});
	await db.program.create({
		data: {
			id: 'seedProgramHardware',
			name: 'Program 2',
			color: '#ff8c37',
			accepts: ['commits', 'devlog', 'elapsed'],
			weeklyReviewGoal: 10,
			reviewersCannotReviewOwnProjects: true,
			hoursJustification: true,
			createdAt: daysAgo(30, 10),
			checklist: {
				create: [
					{ order: 0, label: 'Checklist item 4', tracks: ['hardware'] },
					{ order: 1, label: 'Checklist item 5', tracks: ['hardware'] }
				]
			},
			reviewFields: { create: workbenchFields },
			memberships: {
				create: [
					{ userId: 'seedUserPoc', isPoc: true, tracks: ['software', 'hardware'] },
					{ userId: 'seedUserHardware', tracks: ['hardware'] },
					{ userId: 'seedUserLead', tracks: ['software'] }
				]
			}
		}
	});
	await db.program.create({
		data: {
			id: 'seedProgramArchived',
			name: 'Program 3',
			color: '#a633d6',
			status: 'ARCHIVED',
			accepts: ['commits'],
			createdAt: daysAgo(90, 9),
			memberships: { create: [{ userId: 'seedUserPoc', isPoc: true, tracks: ['software'] }] }
		}
	});
}

async function seedShip(ship: SeedShip): Promise<number> {
	const collaboratorIds = ship.collaboratorIds ?? [];
	const ownerOf = (index: number) =>
		collaboratorIds.length ? collaboratorIds[index % collaboratorIds.length] : ship.makerId;

	const hackatimeSeconds = ship.trackedLost
		? 0
		: sumOf(ship.commits.map((commit) => commit.codingSeconds));
	const afterLastCommitSeconds = ship.afterLastCommitSeconds ?? 0;
	const devlogSeconds = sumOf(ship.devlogs.map((devlog) => devlog.seconds));
	const lapseSeconds = sumOf(ship.clips.map((clip) => clip.lengthSeconds));
	const programSeconds = ship.programSeconds ?? 0;
	const queuedAt = recentOrDaysAgo(ship.queuedDaysAgo, ship.queuedHour ?? 15);
	const projectName = projectSlug(ship.title);

	const commits: Prisma.CommitCreateManySubmissionInput[] = ship.commits.map((commit, index) => ({
		hash: `${ship.id}${index}`.padEnd(40, '0').slice(0, 40), // 40: hex characters in a git sha-1
		message: commit.message,
		committedAt: daysAgo(ship.queuedDaysAgo + ship.commits.length - index, 10 + index),
		additions: commit.additions,
		deletions: commit.deletions,
		codingSeconds: commit.codingSeconds,
		htSeen: true,
		authorName: makerById(ownerOf(index))?.name,
		authorEmail: makerById(ownerOf(index))?.email,
		makerId: ownerOf(index)
	}));

	await db.submission.create({
		data: {
			id: ship.id,
			programId: ship.programId,
			externalId: ship.externalId ?? `external-${ship.id}`,
			version: ship.version ?? 1,
			makerId: ship.makerId,
			title: ship.title,
			description: ship.description,
			repoUrl: `https://example.com/${projectName}`,
			demoUrl: `https://example.com/${projectName}/demo`,
			claimedHours: 0,
			status: ship.status ?? 'pending',
			priority: ship.priority ?? false,
			isUpdate: Boolean(ship.updateMessage),
			updateMessage: ship.updateMessage,
			thumbnailUrl: ship.thumbnailUrl,
			acceptedEvidence: ['commits', 'devlog', 'elapsed'],
			track: ship.track,
			receivedAt: queuedAt,
			ingestedAt: queuedAt,
			queuedAt,
			evidenceSyncedAt: queuedAt,
			hackatimeProjects: [projectName],
			commits: { createMany: { data: commits } },
			devlogs: {
				create: ship.devlogs.map((devlog, index) => ({
					at: daysAgo(ship.queuedDaysAgo + index + 1, 20),
					seconds: devlog.seconds,
					minutes: toLegacyMinutes(devlog.seconds),
					text: devlog.text,
					markdown: devlog.text,
					makerId: ownerOf(index)
				}))
			},
			clips: {
				create: ship.clips.map((clip, index) => ({
					at: daysAgo(ship.queuedDaysAgo + index + 1, 18),
					lengthSeconds: clip.lengthSeconds,
					note: clip.note,
					url: clip.url,
					thumbnailUrl: clip.thumbnailUrl,
					makerId: ownerOf(index)
				}))
			},
			hours: {
				create: {
					hackatimeSeconds,
					devlogSeconds,
					lapseSeconds,
					programSeconds,
					afterLastCommitSeconds,
					afterLastCommitMinutes: toLegacyMinutes(afterLastCommitSeconds),
					hackatimeMinutes: toLegacyMinutes(hackatimeSeconds),
					devlogMinutes: toLegacyMinutes(devlogSeconds),
					lapseMinutes: toLegacyMinutes(lapseSeconds),
					programMinutes: toLegacyMinutes(programSeconds)
				}
			},
			collaborators: {
				create: collaboratorIds.map((makerId, position) => {
					const ownSeconds = (items: { seconds: number }[]) =>
						sumOf(
							items.filter((_item, index) => ownerOf(index) === makerId).map((item) => item.seconds)
						);
					const ownHackatimeSeconds = ship.trackedLost
						? 0
						: ownSeconds(ship.commits.map((commit) => ({ seconds: commit.codingSeconds })));
					const ownDevlogSeconds = ownSeconds(ship.devlogs);
					const ownLapseSeconds = ownSeconds(
						ship.clips.map((clip) => ({ seconds: clip.lengthSeconds }))
					);
					const ownProgramSeconds = position === 0 ? programSeconds : 0;
					return {
						makerId,
						hackatimeSeconds: ownHackatimeSeconds,
						devlogSeconds: ownDevlogSeconds,
						lapseSeconds: ownLapseSeconds,
						programSeconds: ownProgramSeconds,
						hackatimeMinutes: toLegacyMinutes(ownHackatimeSeconds),
						devlogMinutes: toLegacyMinutes(ownDevlogSeconds),
						lapseMinutes: toLegacyMinutes(ownLapseSeconds),
						programMinutes: toLegacyMinutes(ownProgramSeconds)
					};
				})
			}
		}
	});

	return seedReview(db, ship);
}

// the private checkout seeds what only its features read
async function seedPrivateRows() {
	const entry = new URL('../private/web/seed.ts', import.meta.url);
	if (process.env.ARI_PUBLIC_BUILD === '1' || !existsSync(entry)) return;
	const extension = await import(entry.href);
	await extension.seedPrivate(db, { encryptSecret, seedShip });
}

async function main() {
	await clearSeedRows();
	await seedPeople();
	await seedPrograms();
	const approvedSecondsByShip = new Map<string, number>();
	for (const ship of seedShips) approvedSecondsByShip.set(ship.id, await seedShip(ship));
	await seedActivity(db, approvedSecondsByShip);
	await seedSessions(db);
	await seedFlags(db);
	await seedDeliveries(db);
	await seedOutboundSecret();
	await seedAccess(db);
	await seedReviewPage(db);
	await seedPrivateRows();
	console.log(
		`Seeded ${seedUsers.length} users, 3 programs, ${seedMakers.length} makers, ${seedShips.length} ships.`
	);
	// 30 minutes: the claim ttl in src/lib/server/claims.ts
	console.log(
		'Live claims (seedShipPending15 User 3, 17 User 5, 29 User 4) last 30 minutes from now: re-running bun run db:seed renews them.'
	);
	console.log('Sign in at http://localhost:5173/auth/dev');
	console.log(`Priority form: http://localhost:5173/priority/${priorityFormToken}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
