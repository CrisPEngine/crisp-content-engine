import 'server-only';

import { completeStructuredJson, LlmError, type LlmMessage } from '@/lib/llm';
import {
	resolveIdeaEngineLlmModel,
	resolveIdeaEngineMaxTokens,
	resolveIdeaEngineOpenAiTimeoutMs,
	resolveIdeaEngineTemperature,
} from '../config';
import { logIdeaEngineLifecycle } from '../observability/lifecycle';
import { setRunGenerationStage, IDEA_ENGINE_GENERATION_STAGES } from '../persistence/generationStage';
import { IdeaEngineError } from '../errors';
import {
	ideaEngineChannelResponseSchema,
	type IdeaEngineItem,
} from '../validation/schemas';

function buildRepairPrompt(rawOutput: unknown, validationError: string): string {
	return [
		'Your previous JSON response failed schema validation.',
		'Fix every issue and return ONLY valid JSON matching the required item schema.',
		'Each item must include: channel, body_draft (non-empty), series_position, series_total.',
		'',
		'Validation errors:',
		validationError,
		'',
		'Previous invalid output:',
		JSON.stringify(rawOutput),
	].join('\n');
}

export type IdeaEngineCompletionTiming = {
	openaiDurationMs: number;
	validationDurationMs: number;
};

export async function completeIdeaEngineItemsWithRepair(
	messages: LlmMessage[],
	options?: { runId?: string; channel?: string },
): Promise<{ items: IdeaEngineItem[]; timing: IdeaEngineCompletionTiming }> {
	let lastValidationError: string | undefined;
	let lastRaw: unknown;
	let openaiDurationMs = 0;
	let validationDurationMs = 0;

	for (let attempt = 1; attempt <= 2; attempt++) {
		const attemptMessages: LlmMessage[] =
			attempt === 1
				? messages
				: [
						...messages,
						{
							role: 'user',
							content: buildRepairPrompt(lastRaw, lastValidationError!),
						},
					];

		try {
			if (options?.runId) {
				await setRunGenerationStage(options.runId, IDEA_ENGINE_GENERATION_STAGES.openaiRequest);
				logIdeaEngineLifecycle('openai_request_started', options.runId, {
					channel: options.channel,
					attempt,
				});
			}

			const openAiStartedAt = Date.now();
			const result = await completeStructuredJson<{ items: IdeaEngineItem[] }>({
				model: resolveIdeaEngineLlmModel(),
				messages: attemptMessages,
				temperature: resolveIdeaEngineTemperature(),
				maxTokens: resolveIdeaEngineMaxTokens(),
				timeoutMs: resolveIdeaEngineOpenAiTimeoutMs(),
			});
			openaiDurationMs += Date.now() - openAiStartedAt;

			if (options?.runId) {
				logIdeaEngineLifecycle('openai_request_completed', options.runId, {
					channel: options.channel,
					attempt,
					duration_ms: Date.now() - openAiStartedAt,
				});
			}

			if (options?.runId) {
				await setRunGenerationStage(options.runId, IDEA_ENGINE_GENERATION_STAGES.validating);
				logIdeaEngineLifecycle('validation_started', options.runId, { channel: options.channel });
			}

			const validationStartedAt = Date.now();
			const parsed = ideaEngineChannelResponseSchema.safeParse(result.data);
			validationDurationMs += Date.now() - validationStartedAt;

			if (options?.runId) {
				logIdeaEngineLifecycle('validation_completed', options.runId, {
					channel: options.channel,
					ok: parsed.success,
					duration_ms: Date.now() - validationStartedAt,
				});
			}
			if (parsed.success) {
				return {
					items: parsed.data.items,
					timing: { openaiDurationMs, validationDurationMs },
				};
			}

			lastValidationError = JSON.stringify(parsed.error.flatten());
			lastRaw = result.data;
		} catch (error) {
			if (error instanceof LlmError && error.retryable && attempt < 2) {
				await new Promise((r) => setTimeout(r, 1000 * attempt));
				continue;
			}
			throw error;
		}
	}

	throw new IdeaEngineError('Generated content failed validation after repair retry', {
		status: 502,
		code: 'idea_engine_schema_validation_failed',
		details: lastValidationError,
	});
}
