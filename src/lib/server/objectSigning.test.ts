import { describe, expect, test } from 'bun:test';
import { signObjectRequest } from './objectSigning';

// the "put object" example from the aws signature version 4 documentation for s3
describe('signObjectRequest', () => {
	const keys = {
		accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
		secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
		region: 'us-east-1'
	};
	const sign = () =>
		signObjectRequest(
			'PUT',
			new URL('https://examplebucket.s3.amazonaws.com/test$file.text'),
			{ Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
			new TextEncoder().encode('Welcome to Amazon S3.'),
			keys,
			new Date('2013-05-24T00:00:00.000Z')
		);

	test('matches the documented signature', () => {
		expect(sign().authorization).toBe(
			'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd'
		);
	});

	test('adds the headers the signature covers', () => {
		const headers = sign();
		expect(headers.host).toBe('examplebucket.s3.amazonaws.com');
		expect(headers['x-amz-date']).toBe('20130524T000000Z');
		expect(headers['x-amz-content-sha256']).toBe(
			'44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072'
		);
	});
});
