import { db } from '$lib/server/db';
import { decrypt } from '$lib/server/crypto';
import { generateSecret } from '$lib/server/webhookSecrets';

export type SecretResult =
	| { ok: true; plaintext: string }
	| { ok: false; status: number; error: string };

export const maskSecret = (last4: string): string => `whsec_••••••••••••${last4}`;

export const activeIngestSecret = (programId: string) =>
	db.webhookSecret.findFirst({
		where: { programId, revokedAt: null },
		orderBy: { createdAt: 'desc' }
	});

export async function rollIngestSecret(programId: string, actorId: string): Promise<SecretResult> {
	const fresh = generateSecret();
	await db.$transaction([
		db.webhookSecret.updateMany({
			where: { programId, revokedAt: null },
			data: { revokedAt: new Date() }
		}),
		db.webhookSecret.create({
			data: { programId, secretEnc: fresh.secretEnc, last4: fresh.last4 }
		}),
		db.activityEvent.create({
			data: {
				programId,
				kind: 'SECRET',
				actorId,
				text: `Rolled ingest signing secret · ••••${fresh.last4}`,
				meta: { scope: 'ingest', op: 'roll', last4: fresh.last4 }
			}
		})
	]);
	return { ok: true, plaintext: fresh.plaintext };
}

export async function revealIngestSecret(programId: string): Promise<SecretResult> {
	const secret = await activeIngestSecret(programId);
	if (!secret) {
		return { ok: false, status: 400, error: 'No signing secret yet. Generate one first.' };
	}
	return { ok: true, plaintext: decrypt(secret.secretEnc) };
}

export async function rollOutboundSecret(
	programId: string,
	actorId: string
): Promise<SecretResult> {
	const fresh = generateSecret();
	await db.$transaction([
		db.outboundEndpoint.upsert({
			where: { programId },
			create: { programId, secretEnc: fresh.secretEnc, last4: fresh.last4 },
			update: { secretEnc: fresh.secretEnc, last4: fresh.last4 }
		}),
		db.activityEvent.create({
			data: {
				programId,
				kind: 'SECRET',
				actorId,
				text: `Rolled outbound signing secret · ••••${fresh.last4}`,
				meta: { scope: 'outbound', op: 'roll', last4: fresh.last4 }
			}
		})
	]);
	return { ok: true, plaintext: fresh.plaintext };
}

export async function revealOutboundSecret(programId: string): Promise<SecretResult> {
	const endpoint = await db.outboundEndpoint.findUnique({ where: { programId } });
	if (!endpoint?.secretEnc) {
		return { ok: false, status: 400, error: 'No outbound secret yet. Generate one first.' };
	}
	return { ok: true, plaintext: decrypt(endpoint.secretEnc) };
}
