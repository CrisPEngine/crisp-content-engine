import { describe, expect, it } from 'vitest';
import { estimateModelCostUsd } from '../pricing';

describe('model cost estimates', () => {
	it('prices standard short-context GPT-6 Sol and returns null for unknown models', () => {
		expect(estimateModelCostUsd({ model: 'gpt-6.1-sol', inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(12);
		expect(estimateModelCostUsd({ model: 'gpt-6-luna', inputTokens: 1000, outputTokens: 1000 })).toBe(0.0006);
		expect(estimateModelCostUsd({ model: 'gpt-4o', inputTokens: 100, outputTokens: 100 })).toBeNull();
	});
});