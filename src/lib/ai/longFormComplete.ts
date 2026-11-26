import 'server-only';

import type { LlmMessage } from '@/lib/llm';
import { completeWithRole } from './complete';
import {
	countWords,
	isOutputTruncated,
	type WordCountRange,
	wordCountInRange,
} from './truncation';
import { currentLogScope } from './logging';
import { estimateModelCostUsd } from './pricing';
import { LONG_FORM_MODEL_ROLE, resolveLongFormMaxTokens, resolveLongFormTimeoutMs } from './longFormConfig';
import type { ModelRole } from './roles';
import { coerceModelText } from '@/lib/content/channelBodyLimit';

export type LongFormCompletionMeta = {
	finishReason?: string | null;
	incompleteReason?: string | null;
	continuationPasses: number;
	wordCount: number;
	truncated: boolean;
	maxTokens: number;
};

export type LongFormJsonResult<T> = {
	data: T;
	model?: string;
	rawUsage?: {
		promptTokens?: number;
		completionTokens?: number;
		reasoningTokens?: number;
	};
	meta: LongFormCompletionMeta;
};

type ExtractText<T> = (data: T) => string;
type MergeContinuation<T> = (previous: T, continuationText: string) => T;

const MAX_CONTINUATIONS = 3;

export async function completeLongFormJson<T>(input: {
	role?: ModelRole;
	messages: LlmMessage[];
	feature: string;
	sectionId?: string;
	userId?: string;
	maxTokens?: number;
	timeoutMs?: number;
	extractText: ExtractText<T>;
	mergeContinuation: MergeContinuation<T>;
	wordRange?: WordCountRange;
}): Promise<LongFormJsonResult<T>> {
	const role = input.role ?? LONG_FORM_MODEL_ROLE;
	const started = Date.now();
	const maxTokens = input.maxTokens ?? resolveLongFormMaxTokens();
	const timeoutMs = input.timeoutMs ?? resolveLongFormTimeoutMs();
	const messages = input.messages;
	let continuationPasses = 0;
	let lastFinish: { finishReason?: string | null; incompleteReason?: string | null } = {};

	let result = await completeWithRole<T>(role, {
		messages,
		feature: input.feature,
		userId: input.userId,
		maxTokens,
		timeoutMs,
	});
	const usage = {
		promptTokens: result.rawUsage?.promptTokens ?? 0,
		completionTokens: result.rawUsage?.completionTokens ?? 0,
		reasoningTokens: result.rawUsage?.reasoningTokens ?? 0,
	};
	const addUsage = (next?: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number }) => {
		usage.promptTokens += next?.promptTokens ?? 0;
		usage.completionTokens += next?.completionTokens ?? 0;
		usage.reasoningTokens += next?.reasoningTokens ?? 0;
	};

	for (let pass = 0; pass <= MAX_CONTINUATIONS; pass += 1) {
		lastFinish = {
			finishReason: result.finishReason,
			incompleteReason: result.incompleteReason,
		};
		const text = coerceModelText(input.extractText(result.data)).trim();
		const truncated = isOutputTruncated({ text, ...lastFinish });
		logGenerationAttempt({
			feature: input.feature,
			sectionId: input.sectionId,
			model: result.model,
			provider: result.provider,
			attempt: pass + 1,
			maxTokens,
			text,
			truncated,
			finishReason: lastFinish.finishReason,
			incompleteReason: lastFinish.incompleteReason,
			usage: result.rawUsage,
			durationMs: Date.now() - started,
			recovery: truncated && pass < MAX_CONTINUATIONS ? 'continue' : truncated ? 'section_retry' : 'accept',
		});
		if (!truncated || pass >= MAX_CONTINUATIONS) break;
		continuationPasses += 1;
		const tail = text.slice(-2500);
		const continuation = await completeWithRole<T>(role, {
			messages: [
				{
					role: 'system',
					content:
						'Continue the draft exactly where it stopped. Do not repeat earlier sentences. Finish the current sentence and end the section with a complete sentence. Return the same JSON shape as before with only the new continuation in the draft/body field.',
				},
				{
					role: 'user',
					content: `Draft so far:\n${tail}\n\nContinue in the same voice and JSON format. Do not restart the section.`,
				},
			],
			feature: `${input.feature}_continuation`,
			userId: input.userId,
			maxTokens,
			timeoutMs,
		});
		const piece = coerceModelText(input.extractText(continuation.data)).trim();
		addUsage(continuation.rawUsage);
		result = {
			...result,
			data: input.mergeContinuation(result.data, piece),
			model: continuation.model,
			rawUsage: usage,
			finishReason: continuation.finishReason,
			incompleteReason: continuation.incompleteReason,
		};
	}

	let text = coerceModelText(input.extractText(result.data)).trim();
	if (input.wordRange && !wordCountInRange(text, input.wordRange)) {
		const count = countWords(text);
		if (count < input.wordRange.min) {
			const expanded = await completeWithRole<T>(role, {
				messages: [
					{
						role: 'system',
						content: `Expand the draft to ${input.wordRange.min}-${input.wordRange.max} words. Return the same JSON shape. Do not invent unsupported claims.`,
					},
					{ role: 'user', content: text },
				],
				feature: `${input.feature}_expand`,
				userId: input.userId,
				maxTokens,
				timeoutMs,
			});
			addUsage(expanded.rawUsage);
			result = { ...result, ...expanded, data: expanded.data, rawUsage: usage };
			lastFinish = { finishReason: expanded.finishReason, incompleteReason: expanded.incompleteReason };
			text = coerceModelText(input.extractText(result.data)).trim();
		}
	}

	return {
		data: result.data,
		model: result.model,
		rawUsage: usage,
		meta: {
			...lastFinish,
			continuationPasses,
			wordCount: countWords(text),
			truncated: isOutputTruncated({ text, ...lastFinish }),
			maxTokens,
		},
	};
}

function logGenerationAttempt(input: {
	feature: string;
	sectionId?: string;
	model?: string | null;
	provider?: string | null;
	attempt: number;
	maxTokens: number;
	text: string;
	truncated: boolean;
	finishReason?: string | null;
	incompleteReason?: string | null;
	usage?: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number };
	durationMs: number;
	recovery: 'accept' | 'continue' | 'section_retry';
}): void {
	const scope = currentLogScope();
	const completionTokens = input.usage?.completionTokens ?? 0;
	const reasoningTokens = input.usage?.reasoningTokens ?? 0;
	console.info('[article-generation]', {
		correlation_id: scope?.correlationId ?? null,
		content_id: scope?.contentId ?? null,
		section_id: input.sectionId ?? null,
		model: input.model ?? null,
		provider: input.provider ?? null,
		feature: input.feature,
		attempt: input.attempt,
		max_output_tokens: input.maxTokens,
		prompt_tokens: input.usage?.promptTokens ?? null,
		completion_tokens: input.usage?.completionTokens ?? null,
		reasoning_tokens: input.usage?.reasoningTokens ?? null,
		finish_reason: input.finishReason ?? null,
		incomplete_reason: input.incompleteReason ?? null,
		truncated: input.truncated,
		recovery: input.recovery,
		duration_ms: input.durationMs,
		estimated_cost_usd: input.model
			? estimateModelCostUsd({ model: input.model, inputTokens: input.usage?.promptTokens, outputTokens: completionTokens + reasoningTokens })
			: null,
		words: countWords(input.text),
	});
}

export function assertLongFormDraftReady(input: {
	text: string;
	wordRange?: WordCountRange;
	finishReason?: string | null;
	incompleteReason?: string | null;
}): void {
	const truncated = isOutputTruncated({
		text: input.text,
		finishReason: input.finishReason,
		incompleteReason: input.incompleteReason,
	});
	if (truncated) {
		throw new Error('Long-form draft was truncated by the model and cannot be saved.');
	}
	if (input.wordRange && !wordCountInRange(input.text, input.wordRange)) {
		const count = countWords(input.text);
		throw new Error(
			`Long-form draft word count ${count} is outside the required ${input.wordRange.min}-${input.wordRange.max} range.`,
		);
	}
}
