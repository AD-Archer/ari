import type { Prisma, ProgramPermission, Track } from '$db';
import { toLegacyMinutes } from '$lib/time';
import { decisionFormBody } from '$lib/review/decisionForm';
import { draftFromUnknown } from '$lib/review/decisionForm';
import { encrypt } from '$lib/server/crypto';
import { db } from '$lib/server/db';

export const longAudit =
	'Commits line up with the tracked time, the demo runs, and the journal entries describe the work shown in the repository.';

interface ShipOptions {
	track?: Track;
	status?: Prisma.SubmissionCreateInput['status'];
	makerEmail?: string;
	collaborative?: boolean;
	externalId?: string;
	version?: number;
}

// own-prefixed rows for one test file: nothing here touches a seed row
export function reviewFixtures(name: string) {
	const prefix = `${name}${Date.now()}${Math.floor(Math.random() * 1000000)}`; // 1000000: six random digits, 10 ** 6
	const programId = `${prefix}Program`;
	const userIds: string[] = [];
	const makerIds: string[] = [];

	async function user(
		label: string,
		membership: {
			permissions?: ProgramPermission[];
			isPoc?: boolean;
			tracks?: Track[];
			member?: boolean;
			email?: string;
		} = {}
	): Promise<App.SessionUser> {
		const id = `${prefix}${label}`;
		const email = membership.email ?? `${id.toLowerCase()}@example.com`;
		await db.user.create({ data: { id, email, name: label, avatarColor: '#338eda' } });
		userIds.push(id);
		const member = membership.member ?? true;
		const entry = {
			programId,
			permissions: membership.permissions ?? [],
			isPoc: membership.isPoc ?? false,
			tracks: membership.tracks ?? (['software', 'hardware'] as Track[])
		};
		if (member) await db.membership.create({ data: { userId: id, ...entry } });
		return {
			id,
			email,
			name: label,
			namePending: false,
			avatarColor: '#338eda',
			slackId: null,
			orgPermissions: [],
			memberships: member ? [entry] : []
		};
	}

	async function setup(program: Partial<Prisma.ProgramUncheckedCreateInput> = {}) {
		await db.program.create({
			data: {
				id: programId,
				name: prefix,
				color: '#338eda',
				hoursJustification: false,
				...program
			}
		});
		await db.outboundEndpoint.create({
			data: {
				programId,
				url: 'https://hooks.example.test/ari-events',
				enabled: true,
				secretEnc: encrypt('signing-secret')
			}
		});
	}

	async function maker(label: string, email?: string) {
		const id = `${prefix}Maker${label}`;
		await db.maker.create({
			data: { id, email: email ?? `${id.toLowerCase()}@example.com`, name: label }
		});
		makerIds.push(id);
		return id;
	}

	// solo: hackatime 5429 s, one 1830 s journal, one 29 s clip: 7288 s captured.
	// collaborative: two people with 2000 s and 1000 s tracked, one 600 s journal by the first
	async function ship(label: string, options: ShipOptions = {}) {
		const id = `${prefix}${label}`;
		const firstMaker = await maker(`${label}One`, options.makerEmail);
		const secondMaker = options.collaborative ? await maker(`${label}Two`) : null;
		const withMinutes = (seconds: Record<string, number>) => ({
			...seconds,
			...Object.fromEntries(
				Object.entries(seconds).map(([key, value]) => [
					key.replace('Seconds', 'Minutes'),
					toLegacyMinutes(value)
				])
			)
		});
		const journalSeconds = secondMaker ? 600 : 1830;
		await db.submission.create({
			data: {
				id,
				programId,
				externalId: options.externalId ?? id,
				version: options.version ?? 1,
				makerId: firstMaker,
				title: `${label} ship`,
				description: 'A ship for a test.',
				repoUrl: 'https://github.com/maker/ship',
				demoUrl: 'https://example.com/demo',
				claimedHours: 0,
				status: options.status ?? 'pending',
				track: options.track ?? 'software',
				hackatimeProjects: ['ship'],
				hours: {
					create: withMinutes({
						hackatimeSeconds: secondMaker ? 3000 : 5429,
						devlogSeconds: journalSeconds,
						lapseSeconds: secondMaker ? 0 : 29,
						programSeconds: 0
					})
				},
				devlogs: {
					create: {
						id: `${id}Devlog`,
						at: new Date(),
						seconds: journalSeconds,
						minutes: toLegacyMinutes(journalSeconds),
						text: 'Worked on it.',
						markdown: 'Worked on it.',
						makerId: firstMaker
					}
				},
				clips: secondMaker
					? undefined
					: { create: { id: `${id}Clip`, at: new Date(), lengthSeconds: 29, note: 'clip' } },
				collaborators: secondMaker
					? {
							create: [
								{
									makerId: firstMaker,
									...withMinutes({ hackatimeSeconds: 2000, devlogSeconds: 600 })
								},
								{ makerId: secondMaker, ...withMinutes({ hackatimeSeconds: 1000 }) }
							]
						}
					: undefined
			}
		});
		return { id, devlogId: `${id}Devlog`, firstMaker, secondMaker: secondMaker ?? '' };
	}

	const deliveries = async (submissionId: string) =>
		(
			await db.outboundDelivery.findMany({
				where: { programId, submissionId },
				orderBy: { createdAt: 'asc' },
				select: { event: true, payload: true }
			})
		).map((delivery) => ({
			event: delivery.event,
			payload: JSON.parse(delivery.payload ?? '{}') as Record<string, Record<string, unknown>> & {
				collaborators?: Record<string, unknown>[];
			}
		}));

	const events = (submissionId: string) =>
		db.activityEvent.findMany({
			where: { programId, submissionId, kind: { not: 'DELIVERY' } },
			orderBy: { createdAt: 'asc' },
			select: { kind: true, text: true, meta: true, actorId: true }
		});

	async function cleanup() {
		await db.program.deleteMany({ where: { id: programId } });
		await db.maker.deleteMany({ where: { id: { in: makerIds } } });
		await db.user.deleteMany({ where: { id: { in: userIds } } });
		// a requeue queues a capture job in the service's schema, when that schema exists
		await db.$executeRaw`delete from ariw.job where "submissionId" like ${`${prefix}%`}`.catch(
			() => {}
		);
	}

	return { prefix, programId, user, setup, ship, deliveries, events, cleanup };
}

export function decisionForm(fields: Record<string, unknown> = {}, ingestVersion = 1): FormData {
	const form = new FormData();
	const draft = draftFromUnknown({ note: 'Nice work.', audit: longAudit, ...fields });
	for (const [key, value] of Object.entries(decisionFormBody(draft, ingestVersion))) {
		form.set(key, value);
	}
	return form;
}

export const formOf = (fields: Record<string, string>): FormData => {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);
	return form;
};

// what a thrown sveltekit error or redirect carries
export async function thrownStatus(work: () => Promise<unknown>): Promise<number | null> {
	try {
		await work();
		return null;
	} catch (caught) {
		return (caught as { status?: number }).status ?? -1;
	}
}
