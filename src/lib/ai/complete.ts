import 'server-only';

import {
	completeStructuredJson,
	LlmError,
	type LlmMessage,
	type StructuredJsonResult,
} from '@/lib/llm';
import {
	getRoleConfig,
	resolveModelCandidates,
	type ModelRole,
	usesMaxCompletionTokens,
} from './roles';
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

function isModelUnavailable(error: unknown): boolean {
	if (!(error instanceof LlmError)) return false;
	if (error.status === 404) return true;
	const message = error.message.toLowerCase();
	return (
		message.includes('model_not_found') ||
		message.includes('does not exist') ||
		message.includes('does not have access') ||
		message.includes('invalid model')
	);
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

	let lastError: unknown;
	let fallbackUsed = false;

	for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
		const model = candidates[candidateIndex];
		if (candidateIndex > 0) fallbackUsed = true;

		for (let attempt = 1; attempt <= 2; attempt += 1) {
			const startedAt = Date.now();
			try {
				const result = await completeStructuredJson<T>({
					model,
					messages: options.messages,
					jsonSchemaHint: options.jsonSchemaHint,
					temperature: config.omitTemperature && usesMaxCompletionTokens(model) ? undefined : temperature,
					maxTokens,
					timeoutMs,
				});

				logAiInvocation({
					requestId,
					role,
					provider: result.provider,
					model: result.model,
					fallbackUsed,
					promptTokens: result.rawUsage?.promptTokens,
					completionTokens: result.rawUsage?.completionTokens,
					durationMs: Date.now() - startedAt,
					ok: true,
					userId: options.userId,
					feature: options.feature,
				});

				return { ...result, requestId, role, fallbackUsed };
			} catch (error) {
				lastError = error;
				const retryable = error instanceof LlmError && error.retryable;
				const durationMs = Date.now() - startedAt;

				if (isModelUnavailable(error) && candidateIndex < candidates.length - 1) {
					logAiInvocation({
						requestId,
						role,
						provider: 'openai',
						model,
						fallbackUsed,
						durationMs,
						ok: false,
						errorCode: error instanceof LlmError ? error.code : 'model_unavailable',
						userId: options.userId,
						feature: options.feature,
					});
					break;
				}

				if (retryable && attempt < 2) {
					await sleep(400 * attempt);
					continue;
				}

				logAiInvocation({
					requestId,
					role,
					provider: 'openai',
					model,
					fallbackUsed,
					durationMs,
					ok: false,
					errorCode: error instanceof LlmError ? error.code : 'llm_unknown',
					userId: options.userId,
					feature: options.feature,
				});

				if (retryable && candidateIndex < candidates.length - 1) {
					break;
				}
				throw error;
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('AI completion failed');
}
