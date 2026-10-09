import { describe, expect, it } from 'vitest';
import { assertMemoryChannelConstraints, validateMemoryChannelConstraints } from '../validateMemory';

describe('validateMemoryChannelConstraints', () => {
	it('blocks Threads copy over 500 characters', () => {
		const body = 'a'.repeat(501);
		const result = validateMemoryChannelConstraints({
			channel: 'threads',
			contentType: 'thread',
			body,
			hook: 'hook',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]?.code).toBe('too_long');
		}
	});

	it('allows Threads copy at exactly 500 characters', () => {
		const result = validateMemoryChannelConstraints({
			channel: 'threads',
			contentType: 'thread',
			body: 'a'.repeat(500),
			hook: 'hook',
		});
		expect(result.ok).toBe(true);
	});

	it('throws AgentError with a clear message when asserting', () => {
		expect(() =>
			assertMemoryChannelConstraints({
				channel: 'threads',
				contentType: 'thread',
				body: 'x'.repeat(668),
				hook: '',
			}),
		).toThrow(/500 characters or fewer/);
	});
});
