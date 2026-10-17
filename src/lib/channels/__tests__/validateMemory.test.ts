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

	it('blocks Reddit titles over 300 characters via memory metadata', () => {
		const result = validateMemoryChannelConstraints({
			channel: 'reddit',
			contentType: 'reddit_post',
			body: 'Discussion body',
			hook: 'x'.repeat(301),
			metadata: { reddit: { subreddit: 'saas' } },
		});
		expect(result.ok).toBe(false);
	});

	it('blocks Instagram captions over 2200 characters', () => {
		const result = validateMemoryChannelConstraints({
			channel: 'instagram',
			contentType: 'founder_post',
			body: 'a'.repeat(2201),
			hook: 'hook',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((error) => error.code === 'META_CAPTION_OVER_LIMIT')).toBe(true);
		}
	});

	it('blocks Instagram bodies that still contain production section headers', () => {
		const result = validateMemoryChannelConstraints({
			channel: 'instagram',
			contentType: 'founder_post',
			body: 'VISUAL CONCEPT\nA scene\n\nCAPTION\nHello world',
			hook: 'hook',
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((error) => error.code === 'META_PRODUCTION_SECTION_IN_BODY')).toBe(true);
		}
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
