import { createHash, createHmac } from 'node:crypto';

export interface SigningKeys {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
}

const sha256Hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Uint8Array, data: string) =>
	createHmac('sha256', key).update(data).digest();

// s3 wants every byte outside the unreserved set percent-encoded, which is stricter than
// encodeURIComponent, and wants the slashes of the path left alone
const encodePath = (path: string) =>
	path
		.split('/')
		.map((segment) =>
			encodeURIComponent(segment).replace(
				/[!'()*]/g,
				(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
			)
		)
		.join('/');

// aws signature version 4 for one s3 request with no query string. the returned headers are
// the given ones plus the three the signature adds; send them exactly as returned
export function signObjectRequest(
	method: string,
	url: URL,
	headers: Record<string, string>,
	body: Uint8Array,
	keys: SigningKeys,
	now: Date
): Record<string, string> {
	const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, '');
	const day = amzDate.slice(0, 8); // 8: the yyyymmdd of the stamp
	const bodyHash = sha256Hex(body);
	const signed: Record<string, string> = {
		...Object.fromEntries(
			Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()])
		),
		host: url.host,
		'x-amz-content-sha256': bodyHash,
		'x-amz-date': amzDate
	};
	const names = Object.keys(signed).sort();
	const canonicalRequest = [
		method,
		encodePath(decodeURIComponent(url.pathname)),
		'',
		...names.map((name) => `${name}:${signed[name]}`),
		'',
		names.join(';'),
		bodyHash
	].join('\n');
	const scope = `${day}/${keys.region}/s3/aws4_request`;
	const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
	const signingKey = hmac(
		hmac(hmac(hmac(`AWS4${keys.secretAccessKey}`, day), keys.region), 's3'),
		'aws4_request'
	);
	const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
	return {
		...signed,
		authorization: `AWS4-HMAC-SHA256 Credential=${keys.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
	};
}
