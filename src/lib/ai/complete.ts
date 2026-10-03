import 'server-only';

import {
	completeStructuredJson,
	LlmError,
	type LlmMessage,
	type StructuredJsonResult,
} from '@/lib/llm';
import { resolveModelRequestProfile } from '@/lib/llm/modelAdapter';
import {
	getRoleConfig,
	resolveModelCandidates,
	type ModelRole,
} from './roles';
import { estimateModelCostUsd } from './pricing';
import { logAiInvocation } from './logging';

export type CompleteWithRoleOptions = {
	messages: LlmMessage[];
	jsonSchemaHint?: string;
	temperature?: number;
	maxTokens?: number;
	timeoutMs?: number;
	userId?: string;
	feature?: string;
	requestId?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type LlmFailureClass =
	| 'rate_limit'
	| 'provider_outage'
	| 'timeout'
	| 'malformed_request'
	| 'unsupported_parameter'
	| 'invalid_schema'
	| 'programming_error'
	| 'invalid_model'
	| 'authentication_failure'
	| 'billing'
	| 'unknown';

export function classifyLlmFailure(error: unknown): LlmFailureClass {
	if (!(error instanceof LlmError)) return 'programming_error';
	if (error.code === 'llm_timeout' || error.message.toLowerCase().includes('timed out')) return 'timeout';
	if (error.code === 'llm_missing_api_key' || error.status === 401 || error.status === 403) {
		return 'authentication_failure';
	}
	if (error.code === 'llm_invalid_json' || error.code === 'llm_empty_response') return 'invalid_schema';
	if (error.status === 400) {
		const message = error.message.toLowerCase();
		if (message.includes('unsupported') || message.includes('temperature') || message.includes('max_tokens')) {
			return 'unsupported_parameter';
		}
		if (message.includes('model') && (message.includes('invalid') || message.includes('not found') || message.includes('does not exist'))) {
			return 'invalid_model';
		}
		return 'malformed_request';
	}
	if (error.status === 404) return 'invalid_model';
	const message = error.message.toLowerCase();
	if (
		message.includes('model_not_found') ||
		message.includes('does not exist') ||
		message.includes('invalid model') ||
		message.includes('does not have access')
	) {
		return 'invalid_model';
	}
	if (
		message.includes('no credits') ||
		message.includes('insufficient_quota') ||
		message.includes('exceeded your current quota') ||
		message.includes('billing')
	) {
		return 'billing';
	}
	if (error.status === 429 || error.code === 'llm_rate_limit') return 'rate_limit';
	if (error.retryable && (error.status === undefined || error.status >= 500)) return 'provider_outage';
	if (error.retryable) return 'provider_outage';
	return 'unknown';
}

export function mayFallback(classification: LlmFailureClass): boolean {
	return classification === 'rate_limit' || classification === 'provider_outage' || classification === 'timeout';
}

export async function completeWithRole<T>(
	role: ModelRole,
	options: CompleteWithRoleOptions,
): Promise<StructuredJsonResult<T> & { requestId: string; role: ModelRole; fallbackUsed: boolean }> {
	const config = getRoleConfig(role);
	const candidates = resolveModelCandidates(role);
	const requestId = options.requestId || crypto.randomUUID();
	const maxTokens = options.maxTokens ?? config.maxTokens;
	const timeoutMs = options.timeoutMs ?? config.timeoutMs;
	const temperature = options.temperature ?? config.temperature;
	const profileFor = (model: string) => resolveModelRequestProfile(model, config.reasoningEffort);

	let lastError: unknown;
	let fallbackUsed = false;
	let fallbackReason: string | undefined;
	const requestedModel = candidates[0];

	for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
		const model = candidates[candidateIndex];
		if (candidateIndex > 0) fallbackUsed = true;

		for (let attempt = 1; attempt <= 2; attempt += 1) {
			const startedAt = Date.now();
			try {
				const profile = profileFor(model);
				const result = await completeStructuredJson<T>({
					model,
					messages: options.messages,
					jsonSchemaHint: options.jsonSchemaHint,
					temperature: profile.sendTemperature ? temperature : undefined,
					reasoningEffort: profile.reasoningEffort,
					maxTokens,
					timeoutMs,
				});

				logAiInvocation({
					requestId,
					role,
					provider: result.provider,
					model: result.model,
					requestedModel,
					fallbackUsed,
					fallbackReason,
					promptTokens: result.rawUsage?.promptTokens,
					completionTokens: result.rawUsage?.completionTokens,
					reasoningTokens: result.rawUsage?.reasoningTokens,
					estimatedCostUsd: estimateModelCostUsd({
						model: result.model,
						inputTokens: result.rawUsage?.promptTokens,
						outputTokens: result.rawUsage?.completionTokens,
					}),
					durationMs: Date.now() - startedAt,
					ok: true,
					userId: options.userId,
					feature: options.feature,
				});

				return { ...result, requestId, role, fallbackUsed };
			} catch (error) {
				lastError = error;
				const classification = classifyLlmFailure(error);
				const durationMs = Date.now() - startedAt;
				const provider = error instanceof LlmError && error.provider ? error.provider : 'openai';

				logAiInvocation({
					requestId,
					role,
					provider,
					model,
					requestedModel,
					fallbackUsed,
					fallbackReason: classification,
					durationMs,
					ok: false,
					errorCode: error instanceof LlmError ? error.code : classification,
					userId: options.userId,
					feature: options.feature,
				});

				if (mayFallback(classification) && attempt < 2) {
					await sleep(400 * attempt);
					continue;
				}

				if (mayFallback(classification) && candidateIndex < candidates.length - 1) {
					fallbackReason = classification;
					break;
				}
				throw error;
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('AI completion failed');
}
