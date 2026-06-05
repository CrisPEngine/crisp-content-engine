import 'server-only';

export function resolveIdeaEngineLlmModel(): string {
	return process.env.IDEA_ENGINE_LLM_MODEL || 'gpt-4o';
}

export function resolveIdeaEngineTemperature(): number {
	const raw = process.env.IDEA_ENGINE_LLM_TEMPERATURE;
	if (!raw) return 0.7;
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : 0.7;
}

export function resolveIdeaEngineMaxTokens(): number {
	const raw = process.env.IDEA_ENGINE_LLM_MAX_TOKENS;
	if (!raw) return 8192;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : 8192;
}
