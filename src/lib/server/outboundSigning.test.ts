import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { isSafeOutboundUrl, originOf, signDelivery } from './outboundSigning';

describe('delivery signature', () => {
	const secret = 'whsec_test-signing-secret';
	const body = '{"external_id":"proj-1","title":"Test — ship é漢"}';
	const deliveryId = 'cmcka1b2c3d4e5f6g7h8i9j0k';

	test('matches an independent hmac and the vector shared with ari-webhooks', () => {
		const independent = createHmac('sha256', secret)
			.update('1751500000.' + deliveryId + '.' + body)
			.digest('hex');
		expect(signDelivery(secret, 1751500000, deliveryId, body)).toBe(independent);
		expect(independent).toBe('a604592b33cb83d8c719f8b0813b5e898f78654191642699c421c67dab9d9799');
	});

	test('changes with one byte of the body, the timestamp or the delivery id', () => {
		const signature = signDelivery(secret, 1751500000, deliveryId, body);
		expect(signDelivery(secret, 1751500000, deliveryId, body.replace('proj-1', 'proj-2'))).not.toBe(
			signature
		);
		expect(signDelivery(secret, 1751500001, deliveryId, body)).not.toBe(signature);
		expect(signDelivery(secret, 1751500000, deliveryId + 'x', body)).not.toBe(signature);
	});
});

test('outbound url guard', () => {
	for (const allowed of ['https://example.com/hook', 'http://8.8.8.8/hook']) {
		expect(isSafeOutboundUrl(allowed)).toBe(true);
	}
	for (const blocked of [
		'ftp://example.com',
		'not a url',
		'http://localhost:3000',
		'http://app.localhost',
		'http://127.0.0.1',
		'http://10.1.2.3',
		'http://172.16.0.1',
		'http://192.168.1.1',
		'http://169.254.169.254/latest',
		'http://[::1]/',
		'http://[fd00::1]/',
		'http://[fe80::1]/',
		'http://[::ffff:127.0.0.1]/'
	]) {
		expect(isSafeOutboundUrl(blocked)).toBe(false);
	}
	expect(originOf('https://hooks.example.com/services/secret-token?key=1')).toBe(
		'https://hooks.example.com'
	);
	expect(originOf('nope')).toBe('');
});
