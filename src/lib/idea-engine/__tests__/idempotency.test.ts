import { describe, expect, it } from 'vitest';
import {
	createRunRequestFingerprint,
	extractIdempotencyKey,
} from '../idempotency';

describe('extractIdempotencyKey', () => {
	it('reads Idempotency-Key header', () => {
		const request = new Request('https://example.com/api/idea-engine/run', {
			headers: { 'Idempotency-Key': 'run-abc-123' },
		});
		expect(extractIdempotencyKey(request, {})).toBe('run-abc-123');
	});

	it('reads idempotency_key from JSON body', () => {
		const request = new Request('https://example.com/api/idea-engine/run');
		expect(
			extractIdempotencyKey(request, { idempotency_key: 'body-key-456' }),
		).toBe('body-key-456');
	});

	it('returns undefined when no key is provided', () => {
		const request = new Request('https://example.com/api/idea-engine/run');
		expect(extractIdempotencyKey(request, null)).toBeUndefined();
	});
});

describe('createRunRequestFingerprint', () => {
	it('is stable for identical payloads regardless of channel order', () => {
		const a = createRunRequestFingerprint({
			userId: 'user-1',
			brandProfileId: 'brand-1',
			idea: 'My idea text here',
			selectedChannels: ['LinkedIn', 'X'],
			publishMode: 'queue_only',
		});
		const b = createRunRequestFingerprint({
			userId: 'user-1',
			brandProfileId: 'brand-1',
			idea: 'My idea text here',
			selectedChannels: ['X', 'LinkedIn'],
			publishMode: 'queue_only',
		});
		expect(a).toBe(b);
	});
});
