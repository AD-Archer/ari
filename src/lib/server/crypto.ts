import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

// read lazily so a missing key doesn't crash module load or build
function encryptionKey(): Buffer {
	const keyBytes = Buffer.from(env.TOKEN_ENC_KEY ?? '', 'base64');
	if (keyBytes.length !== 32) {
		throw new Error('TOKEN_ENC_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32)');
	}
	return keyBytes;
}

export function encrypt(plainText: string): string {
	const initVector = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), initVector);
	const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return [initVector, authTag, cipherText].map((part) => part.toString('base64')).join('.');
}

export function decrypt(blob: string): string {
	const [initVector, authTag, cipherText] = blob
		.split('.')
		.map((part) => Buffer.from(part, 'base64'));
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), initVector);
	decipher.setAuthTag(authTag);
	return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
}
