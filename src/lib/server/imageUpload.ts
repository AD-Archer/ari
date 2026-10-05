import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { signObjectRequest } from './objectSigning';

const setting = (value: string | undefined) => value?.trim() ?? '';
const storage = () => ({
	// https://<account id>.r2.cloudflarestorage.com, or any other s3-compatible endpoint
	endpoint: setting(env.R2_ENDPOINT).replace(/\/+$/, ''),
	bucket: setting(env.R2_BUCKET),
	accessKeyId: setting(env.R2_ACCESS_KEY_ID),
	secretAccessKey: setting(env.R2_SECRET_ACCESS_KEY),
	// the public address the bucket is served from: the stored image urls start with it
	publicUrl: setting(env.R2_PUBLIC_URL).replace(/\/+$/, '')
});

export const imageUploadsConfigured = (): boolean =>
	Object.values(storage()).every((value) => value.length > 0);

export type ImageUploadResult =
	| { ok: true; url: string }
	| { ok: false; status: number; error: string };

// the extension comes from the checked type, never from the name the browser sent
const extensions: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'image/svg+xml': 'svg'
};

export const imageObjectKey = (type: string, now: Date, id: string) =>
	`uploads/${now.getUTCFullYear()}/${id}.${extensions[type]}`;

// the storage keys never reach the browser: the client only ever sees the returned public url
export async function uploadImage(file: FormDataEntryValue | null): Promise<ImageUploadResult> {
	const target = storage();
	if (!imageUploadsConfigured()) {
		return {
			ok: false,
			status: 503,
			error: 'Image uploads are not configured yet. Paste an image URL instead.'
		};
	}
	if (!(file instanceof File) || file.size === 0) {
		return { ok: false, status: 400, error: 'No image file was provided.' };
	}
	if (!(file.type in extensions)) {
		return { ok: false, status: 422, error: 'That file is not an image we can store.' };
	}
	// 8 MB: 8 * 1024 * 1024
	if (file.size > 8388608) {
		return { ok: false, status: 422, error: 'That image is too large (8MB max).' };
	}

	const now = new Date();
	const key = imageObjectKey(file.type, now, randomUUID());
	const body = new Uint8Array(await file.arrayBuffer());
	const url = new URL(`${target.endpoint}/${target.bucket}/${key}`);
	const headers = signObjectRequest(
		'PUT',
		url,
		{
			'content-type': file.type,
			// the name is random and never reused, so a copy can be kept for good. 1 year: 365 * 24 * 60 * 60
			'cache-control': 'public, max-age=31536000, immutable'
		},
		body,
		// r2 has one region and calls it auto
		{ accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey, region: 'auto' },
		now
	);
	// fetch sets the host itself and refuses to be told
	delete headers.host;

	let response: Response;
	try {
		response = await fetch(url, { method: 'PUT', headers, body });
	} catch {
		return {
			ok: false,
			status: 502,
			error: 'Could not reach image storage. Try again in a moment.'
		};
	}
	if (!response.ok) {
		console.warn(`[uploads] storage answered ${response.status}: ${await response.text()}`);
		return { ok: false, status: 502, error: `Upload failed (http ${response.status}).` };
	}
	return { ok: true, url: `${target.publicUrl}/${key}` };
}
