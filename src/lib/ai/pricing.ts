/**
 * Standard short-context OpenAI rates, USD per 1M tokens.
 * Source: https://developers.openai.com/api/docs/pricing (standard, not batch/flex/fast, not long context).
 * Update this table when prices change. Business logic should call estimateModelCostUsd.
 * Reasoning tokens are recorded separately and treated as already included in output tokens.
 */

export type ModelTokenPrice = {
	inputPerMillion: number;
	outputPerMillion: number;
};

const STANDARD_SHORT_CONTEXT: Record<string, ModelTokenPrice> = {
	'gpt-6-luna': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
	'gpt-6.1-sol': { inputPerMillion: 2, outputPerMillion: 10 },
	'gpt-6-sol': { inputPerMillion: 2, outputPerMillion: 10 },
	'gpt-6-astra': { inputPerMillion: 10, outputPerMillion: 50 },
};

export function priceForModel(model: string): ModelTokenPrice | null {
	const key = Object.keys(STANDARD_SHORT_CONTEXT).find((candidate) => model === candidate || model.startsWith(`${candidate}-`));
	return key ? STANDARD_SHORT_CONTEXT[key] : null;
}

export function estimateModelCostUsd(input: {
	model: string;
	inputTokens?: number | null;
	outputTokens?: number | null;
}): number | null {
	const price = priceForModel(input.model);
	if (!price) return null;
	const inputTokens = input.inputTokens ?? 0;
	const outputTokens = input.outputTokens ?? 0;
	const usd = (inputTokens / 1_000_000) * price.inputPerMillion + (outputTokens / 1_000_000) * price.outputPerMillion;
	return Math.round(usd * 1_000_000) / 1_000_000;
}
