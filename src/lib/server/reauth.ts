import { db } from '$lib/server/db';

export interface ReauthConfig {
	required: boolean;
	ttlMs: number;
}

export async function programReauthConfig(programId: string): Promise<ReauthConfig> {
	const program = await db.program.findUnique({
		where: { id: programId },
		select: { reviewerReauth: true, reviewerReauthTtlMinutes: true }
	});
	return {
		required: program?.reviewerReauth ?? false,
		// 60 minutes mirrors the schema default. 60000 ms in a minute: 60 * 1000
		ttlMs: (program?.reviewerReauthTtlMinutes ?? 60) * 60000
	};
}

export async function hasFreshReauth(
	userId: string,
	programId: string,
	ttlMs: number,
	now: number = Date.now()
): Promise<boolean> {
	const grant = await db.reviewerReauth.findUnique({
		where: { userId_programId: { userId, programId } },
		select: { lastActiveAt: true }
	});
	return grant !== null && now - grant.lastActiveAt.getTime() < ttlMs;
}

export async function grantReauth(userId: string, programId: string): Promise<void> {
	const now = new Date();
	await db.reviewerReauth.upsert({
		where: { userId_programId: { userId, programId } },
		create: { userId, programId, reauthAt: now, lastActiveAt: now },
		update: { reauthAt: now, lastActiveAt: now }
	});
}

export async function touchReauth(userId: string, programId: string): Promise<void> {
	await db.reviewerReauth.updateMany({
		where: { userId, programId },
		data: { lastActiveAt: new Date() }
	});
}

export async function endReauth(userId: string, programId: string): Promise<void> {
	await db.reviewerReauth.deleteMany({ where: { userId, programId } });
}

// returnPath must be a same-site absolute path. /auth/login re-checks before trusting it
export function reauthLoginUrl(programId: string, returnPath: string): string {
	const query = new URLSearchParams({ reauth: '1', program: programId, return: returnPath });
	return `/auth/login?${query}`;
}
