import 'server-only';

import { completeStructuredJson, LlmError, type LlmMessage } from '@/lib/llm';
import {
	resolveIdeaEngineLlmModel,
	resolveIdeaEngineMaxTokens,
	resolveIdeaEngineTemperature,
} from '../config';
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
			const openAiStartedAt = Date.now();
			const result = await completeStructuredJson<{ items: IdeaEngineItem[] }>({
				model: resolveIdeaEngineLlmModel(),
				messages: attemptMessages,
				temperature: resolveIdeaEngineTemperature(),
				maxTokens: resolveIdeaEngineMaxTokens(),
			});
			openaiDurationMs += Date.now() - openAiStartedAt;

			const validationStartedAt = Date.now();
			const parsed = ideaEngineChannelResponseSchema.safeParse(result.data);
			validationDurationMs += Date.now() - validationStartedAt;
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
