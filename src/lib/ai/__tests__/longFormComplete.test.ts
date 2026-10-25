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
			extractText: (data) => data.draft ?? '',
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
