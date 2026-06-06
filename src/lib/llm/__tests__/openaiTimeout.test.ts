import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { openaiProvider } from '../providers/openai';

describe('openaiProvider timeout', () => {
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		global.fetch = originalFetch;
	});

	it('throws llm_timeout when request exceeds timeoutMs', async () => {
		global.fetch = vi.fn(
			(_url, init?: RequestInit) =>
				new Promise((_resolve, reject) => {
					const signal = init?.signal;
					if (signal) {
						signal.addEventListener('abort', () => {
							const err = new Error('Aborted');
							err.name = 'AbortError';
							reject(err);
						});
					}
				}),
		) as typeof fetch;

		const promise = openaiProvider.completeStructuredJson(
			{
				model: 'gpt-4o',
				messages: [{ role: 'user', content: 'hi' }],
				timeoutMs: 1000,
			},
			{ provider: 'openai', apiKey: 'sk-test' },
		);

		await vi.advanceTimersByTimeAsync(1001);

		await expect(promise).rejects.toMatchObject({
			code: 'llm_timeout',
			retryable: true,
		});
	});
});
