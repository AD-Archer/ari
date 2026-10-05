import type { FileHour, PastProject } from '$lib/review/reviewTypes';
import { db } from '$lib/server/db';

// both tables belong to ari-webhooks, hence raw sql. a deployment whose service migrations
// have not run answers empty instead of breaking the review screen

export async function shipFileHours(submissionId: string): Promise<FileHour[] | null> {
	const rows = await db.$queryRaw<
		{ path: string; seconds: number; bytes: bigint | null; status: string }[]
	>`select path, seconds, bytes, status from ariw."submissionFileHours"
				where "submissionId" = ${submissionId} order by seconds desc, path asc`.catch((caught) => {
		console.error(`[review] file hours read for ${submissionId} failed`, caught);
		return [];
	});
	if (!rows.length) return null;
	return rows.map((row) => ({
		path: row.path,
		seconds: Math.max(0, Math.trunc(Number(row.seconds))),
		bytes: row.bytes === null ? null : Number(row.bytes),
		status: row.status as FileHour['status']
	}));
}

export async function shipPastProjects(
	submissionId: string,
	knownByEmail: Map<string, { name: string }>
): Promise<PastProject[]> {
	const rows = await db.$queryRaw<
		{
			recordUrl: string;
			email: string;
			programs: string[];
			codeUrl: string;
			playableUrl: string;
			description: string;
			screenshotUrl: string;
			hackatimeProjects: string[];
			creditedSeconds: number;
			approvedAt: Date | null;
		}[]
	>`select "recordUrl", email, programs, "codeUrl", "playableUrl", description,
	         "screenshotUrl", "hackatimeProjects", "creditedSeconds", "approvedAt"
				from ariw."submissionPastProjects" where "submissionId" = ${submissionId}
				order by "approvedAt" desc nulls last, "recordId" asc`.catch((caught) => {
		console.error(`[review] past projects read for ${submissionId} failed`, caught);
		return [];
	});
	return rows.map((row) => ({
		recordUrl: row.recordUrl,
		email: row.email,
		makerName: knownByEmail.get(row.email.toLowerCase())?.name ?? null,
		programs: row.programs,
		codeUrl: row.codeUrl,
		playableUrl: row.playableUrl,
		description: row.description,
		screenshotUrl: row.screenshotUrl,
		hackatimeProjects: row.hackatimeProjects,
		creditedSeconds: Number(row.creditedSeconds),
		approvedAt: row.approvedAt?.toISOString() ?? null
	}));
}
