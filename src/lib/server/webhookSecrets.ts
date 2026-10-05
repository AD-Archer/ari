import { randomBytes } from 'node:crypto';
import { encrypt } from '$lib/server/crypto';

export function generateSecret(): { plaintext: string; secretEnc: string; last4: string } {
	const plaintext = 'whsec_' + randomBytes(24).toString('base64url'); // 24 bytes: 32 base64url chars
	return { plaintext, secretEnc: encrypt(plaintext), last4: plaintext.slice(-4) };
}
