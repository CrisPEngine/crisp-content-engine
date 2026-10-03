import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdeaEngineError } from '../errors';

vi.mock('@/lib/ai', () => ({
	completeWithRole: vi.fn(),
}));

vi.mock('@/lib/llm', () => ({
	LlmError: class LlmError extends Error {
		retryable = false;
	},
}));

vi.mock('../config', () => ({
	resolveIdeaEngineLlmModel: () => 'gpt-4o-mini',
	resolveIdeaEngineMaxTokens: () => 4096,
	resolveIdeaEngineTemperature: () => 0.7,
	resolveIdeaEngineOpenAiTimeoutMs: () => 90_000,
}));

vi.mock('../persistence/generationStage', () => ({
	setRunGenerationStage: vi.fn().mockResolvedValue(undefined),
	IDEA_ENGINE_GENERATION_STAGES: {
		openaiRequest: 'openai_request',
		validating: 'validating',
	},
}));

vi.mock('../observability/lifecycle', () => ({
	logIdeaEngineLifecycle: vi.fn(),
}));

import { completeWithRole } from '@/lib/ai';
import { completeIdeaEngineItemsWithRepair } from '../generator/completeWithValidationRepair';

function routed(data: unknown) {
	return {
		data,
		provider: 'openai' as const,
		model: 'gpt-4o',
		requestId: 'req',
		role: 'WRITING' as const,
		fallbackUsed: false,
	};
}

const validItem = {
	channel: 'LinkedIn' as const,
	post_title: 'Hook',
	body_draft: 'Body content',
	series_position: 1,
	series_total: 1,
};

describe('completeIdeaEngineItemsWithRepair', () => {
	beforeEach(() => {
		vi.mocked(completeWithRole).mockReset();
	});

	it('returns items when first response validates', async () => {
		vi.mocked(completeWithRole).mockResolvedValueOnce(routed({ items: [validItem] }));

		const { items } = await completeIdeaEngineItemsWithRepair([
			{ role: 'system', content: 'test' },
		]);
		expect(items).toHaveLength(1);
		expect(completeWithRole).toHaveBeenCalledWith('WRITING', expect.any(Object));
	});

	it('retries once with repair prompt after Zod validation failure', async () => {
		vi.mocked(completeWithRole)
			.mockResolvedValueOnce(routed({ items: [{ channel: 'LinkedIn', series_position: 1, series_total: 1 }] }))
			.mockResolvedValueOnce(routed({ items: [validItem] }));

		const { items } = await completeIdeaEngineItemsWithRepair([
			{ role: 'user', content: 'generate' },
		]);

		expect(items).toHaveLength(1);
		expect(completeWithRole).toHaveBeenCalledTimes(2);
		const repairCall = vi.mocked(completeWithRole).mock.calls[1][1] as { messages: Array<{ content: string }> };
		expect(repairCall.messages.some((m) => m.content.includes('schema validation'))).toBe(true);
	});

	it('throws IdeaEngineError when repair retry still fails validation', async () => {
		const invalid = { items: [{ channel: 'LinkedIn', series_position: 1, series_total: 1 }] };
		vi.mocked(completeWithRole)
			.mockResolvedValueOnce(routed(invalid))
			.mockResolvedValueOnce(routed(invalid));

		await expect(
			completeIdeaEngineItemsWithRepair([{ role: 'user', content: 'generate' }]),
		).rejects.toBeInstanceOf(IdeaEngineError);
	});
});
