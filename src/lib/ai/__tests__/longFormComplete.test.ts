import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { completeLongFormJson } from '../longFormComplete';

vi.mock('../complete', () => ({
	completeWithRole: vi.fn(),
}));

import { completeWithRole } from '../complete';

describe('completeLongFormJson', () => {
	beforeEach(() => {
		vi.mocked(completeWithRole).mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('continues when the first completion ends mid-sentence', async () => {
		vi.mocked(completeWithRole)
			.mockResolvedValueOnce({
				data: { draft: 'Opening paragraph that stops without finishing the thought about' },
				model: 'gpt-6.1-sol',
				provider: 'openai',
				finishReason: 'length',
				requestId: '1',
				role: 'LONG_FORM_WRITING',
				fallbackUsed: false,
			})
			.mockResolvedValueOnce({
				data: { draft: 'canon and author control.' },
				model: 'gpt-6.1-sol',
				provider: 'openai',
				finishReason: 'stop',
				requestId: '2',
				role: 'LONG_FORM_WRITING',
				fallbackUsed: false,
			});

		const result = await completeLongFormJson<{ draft?: string }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_long_form',
			extractText: (data) => data.draft ?? '',
			mergeContinuation: (previous, piece) => ({
				...previous,
				draft: `${(previous.draft ?? '').trim()} ${piece}`.trim(),
			}),
		});

		expect(completeWithRole).toHaveBeenCalledTimes(2);
		expect(result.data.draft).toContain('canon and author control.');
		expect(result.meta.continuationPasses).toBe(1);
		expect(result.meta.truncated).toBe(false);
		const continuation = vi.mocked(completeWithRole).mock.calls[1]?.[1] as { messages: Array<{ content: string }> };
		expect(continuation.messages.map((message) => message.content).join('\n')).toContain('Draft so far:');
		expect(continuation.messages.map((message) => message.content).join('\n')).toContain('stops without finishing');
	});

	it('does not continue a stopped response that ends on a real word', async () => {
		vi.mocked(completeWithRole).mockResolvedValueOnce({
			data: { draft: 'Choose one idea and write the scene that proves it before comparing it with every other possibility collected this week' },
			model: 'gpt-6.1-sol',
			provider: 'openai',
			finishReason: 'stop',
			requestId: '1',
			role: 'LONG_FORM_WRITING',
			fallbackUsed: false,
		});
		const result = await completeLongFormJson<{ draft?: string }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_stop',
			extractText: (data) => data.draft ?? '',
			mergeContinuation: (previous, piece) => ({ ...previous, draft: `${previous.draft ?? ''} ${piece}`.trim() }),
		});
		expect(completeWithRole).toHaveBeenCalledTimes(1);
		expect(result.meta.truncated).toBe(false);
	});

	it('stops after the continuation limit and reports the section as unfinished', async () => {
		vi.mocked(completeWithRole).mockResolvedValue({
			data: { draft: 'The paragraph keeps going and' },
			model: 'gpt-6.1-sol',
			provider: 'openai',
			finishReason: 'length',
			requestId: 'cut',
			role: 'LONG_FORM_WRITING',
			fallbackUsed: false,
		});
		const result = await completeLongFormJson<{ draft?: string }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_repeat',
			extractText: (data) => data.draft ?? '',
			mergeContinuation: (previous, piece) => ({ ...previous, draft: `${previous.draft ?? ''} ${piece}`.trim() }),
		});
		expect(completeWithRole).toHaveBeenCalledTimes(4);
		expect(result.meta.continuationPasses).toBe(3);
		expect(result.meta.truncated).toBe(true);
	});

	it('rejects a timeout instead of saving the missing section', async () => {
		vi.mocked(completeWithRole).mockRejectedValueOnce(new Error('llm_timeout'));
		await expect(completeLongFormJson<{ draft?: string }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_timeout',
			extractText: (data) => data.draft ?? '',
			mergeContinuation: (previous) => previous,
		})).rejects.toThrow('llm_timeout');
	});

	it('rejects rate limiting instead of treating it as a finished section', async () => {
		vi.mocked(completeWithRole).mockRejectedValueOnce(new Error('llm_rate_limited'));
		await expect(completeLongFormJson<{ draft?: string }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_rate',
			extractText: (data) => data.draft ?? '',
			mergeContinuation: (previous) => previous,
		})).rejects.toThrow('llm_rate_limited');
	});

	it('coerces non-string draft fields before trim', async () => {
		vi.mocked(completeWithRole).mockResolvedValueOnce({
			data: { draft: { text: 'Structured draft line.' } },
			model: 'gpt-6.1-sol',
			provider: 'openai',
			finishReason: 'stop',
			requestId: '1',
			role: 'LONG_FORM_WRITING',
			fallbackUsed: false,
		});

		const result = await completeLongFormJson<{ draft?: unknown }>({
			messages: [{ role: 'user', content: 'Write' }],
			feature: 'test_structured',
			extractText: (data) => (data.draft ?? '') as string,
			mergeContinuation: (previous, piece) => ({
				...previous,
				draft: `${coerce(previous.draft)} ${piece}`.trim(),
			}),
		});

		function coerce(value: unknown): string {
			if (typeof value === 'string') return value;
			if (value && typeof value === 'object' && 'text' in value) return String((value as { text: string }).text);
			return '';
		}

		expect(result.meta.wordCount).toBeGreaterThan(0);
		expect(result.meta.continuationPasses).toBe(0);
	});
});
