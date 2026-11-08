import 'server-only';

import type { LlmMessage } from '@/lib/llm';
import { completeWithRole } from './complete';
import {
	countWords,
	isOutputTruncated,
	type WordCountRange,
	wordCountInRange,
} from './truncation';
import { LONG_FORM_MODEL_ROLE, resolveLongFormMaxTokens, resolveLongFormTimeoutMs } from './longFormConfig';
import type { ModelRole } from './roles';
import { coerceModelText } from '@/lib/content/channelBodyLimit';

export type LongFormCompletionMeta = {
	finishReason?: string | null;
	incompleteReason?: string | null;
	continuationPasses: number;
	wordCount: number;
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
	userId?: string;
	maxTokens?: number;
	timeoutMs?: number;
	extractText: ExtractText<T>;
	mergeContinuation: MergeContinuation<T>;
	wordRange?: WordCountRange;
}): Promise<LongFormJsonResult<T>> {
	const role = input.role ?? LONG_FORM_MODEL_ROLE;
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
		if (!truncated || pass >= MAX_CONTINUATIONS) break;
		continuationPasses += 1;
		const tail = text.slice(-800);
		const continuation = await completeWithRole<T>(role, {
			messages: [
				{
					role: 'system',
					content:
						'Continue the draft exactly where it stopped. Do not repeat earlier sentences. Return the same JSON shape as before with only the new continuation in the draft/body field.',
				},
				{
					role: 'user',
					content: `Previous ending:\n${tail}\n\nContinue in the same voice and JSON format.`,
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
		},
	};
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
