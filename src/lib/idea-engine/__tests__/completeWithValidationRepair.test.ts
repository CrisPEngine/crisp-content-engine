import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdeaEngineError } from '../errors';

vi.mock('@/lib/llm', () => ({
	completeStructuredJson: vi.fn(),
	LlmError: class LlmError extends Error {
		retryable = false;
	},
}));

vi.mock('../config', () => ({
	resolveIdeaEngineLlmModel: () => 'gpt-4o-mini',
	resolveIdeaEngineMaxTokens: () => 4096,
	resolveIdeaEngineTemperature: () => 0.7,
}));

import { completeStructuredJson } from '@/lib/llm';
import { completeIdeaEngineItemsWithRepair } from '../generator/completeWithValidationRepair';

const validItem = {
	channel: 'LinkedIn' as const,
	post_title: 'Hook',
	body_draft: 'Body content',
	series_position: 1,
	series_total: 1,
};

describe('completeIdeaEngineItemsWithRepair', () => {
	beforeEach(() => {
		vi.mocked(completeStructuredJson).mockReset();
	});

	it('returns items when first response validates', async () => {
		vi.mocked(completeStructuredJson).mockResolvedValueOnce({
			data: { items: [validItem] },
			provider: 'openai',
			model: 'gpt-4o-mini',
		});

		const { items } = await completeIdeaEngineItemsWithRepair([
			{ role: 'system', content: 'test' },
		]);
		expect(items).toHaveLength(1);
		expect(completeStructuredJson).toHaveBeenCalledTimes(1);
	});

	it('retries once with repair prompt after Zod validation failure', async () => {
		vi.mocked(completeStructuredJson)
			.mockResolvedValueOnce({
				data: { items: [{ channel: 'LinkedIn', series_position: 1, series_total: 1 }] },
				provider: 'openai',
				model: 'gpt-4o-mini',
			})
			.mockResolvedValueOnce({
				data: { items: [validItem] },
				provider: 'openai',
				model: 'gpt-4o-mini',
			});

		const { items } = await completeIdeaEngineItemsWithRepair([
			{ role: 'user', content: 'generate' },
		]);

		expect(items).toHaveLength(1);
		expect(completeStructuredJson).toHaveBeenCalledTimes(2);
		const repairCall = vi.mocked(completeStructuredJson).mock.calls[1][0];
		expect(repairCall.messages.some((m) => m.content.includes('schema validation'))).toBe(true);
	});

	it('throws IdeaEngineError when repair retry still fails validation', async () => {
		const invalid = { items: [{ channel: 'LinkedIn', series_position: 1, series_total: 1 }] };
		vi.mocked(completeStructuredJson)
			.mockResolvedValueOnce({ data: invalid, provider: 'openai', model: 'gpt-4o-mini' })
			.mockResolvedValueOnce({ data: invalid, provider: 'openai', model: 'gpt-4o-mini' });

		await expect(
			completeIdeaEngineItemsWithRepair([{ role: 'user', content: 'generate' }]),
		).rejects.toBeInstanceOf(IdeaEngineError);
	});
});
