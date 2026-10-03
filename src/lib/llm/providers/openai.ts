import 'server-only';

import { resolveModelRequestProfile } from '../modelAdapter';
import type { LlmAuthContext, LlmProvider, StructuredJsonRequest, StructuredJsonResult } from '../types';
import { LlmError } from '../types';

type OpenAIErrorBody = { message?: string; type?: string; code?: string };

type OpenAIChatResponse = {
	model?: string;
	choices?: Array<{ message?: { content?: string } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
	error?: OpenAIErrorBody;
};

type OpenAIResponsesPayload = {
	model?: string;
	output_text?: string;
	status?: string;
	incomplete_details?: { reason?: string };
	output?: Array<{
		type?: string;
		content?: Array<{ type?: string; text?: string }>;
	}>;
	usage?: { input_tokens?: number; output_tokens?: number };
	error?: OpenAIErrorBody;
};

function billingFailure(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes('no credits') ||
		lower.includes('insufficient_quota') ||
		lower.includes('exceeded your current quota') ||
		lower.includes('billing')
	);
}

function responseText(payload: OpenAIResponsesPayload): string {
	if (payload.output_text?.trim()) return payload.output_text;
	const chunks: string[] = [];
	for (const item of payload.output ?? []) {
		if (item.type !== 'message') continue;
		for (const part of item.content ?? []) {
			if (part.text) chunks.push(part.text);
		}
	}
	return chunks.join('').trim();
}

export const openaiProvider: LlmProvider = {
	id: 'openai',

	async completeStructuredJson<T>(
		request: StructuredJsonRequest,
		auth: LlmAuthContext,
	): Promise<StructuredJsonResult<T>> {
		if (auth.provider !== 'openai') {
			throw new LlmError('OpenAI provider requires auth.provider=openai', {
				code: 'llm_provider_mismatch',
				provider: 'openai',
			});
		}

		const timeoutMs = request.timeoutMs ?? 90_000;
		const profile = resolveModelRequestProfile(request.model, request.reasoningEffort);
		const maxTokens = request.maxTokens ?? 2048;
		const endpoint = profile.api === 'responses'
			? 'https://api.openai.com/v1/responses'
			: 'https://api.openai.com/v1/chat/completions';
		const input = profile.api === 'responses' && !request.messages.some((message) => /\bjson\b/i.test(message.content))
			? [...request.messages, { role: 'system' as const, content: 'Respond with json.' }]
			: request.messages;
		const body: Record<string, unknown> = profile.api === 'responses'
			? {
				model: request.model,
				input,
				max_output_tokens: maxTokens,
				store: false,
				reasoning: { effort: profile.reasoningEffort },
				text: { format: { type: 'json_object' } },
			}
			: {
				model: request.model,
				messages: request.messages,
				response_format: { type: 'json_object' },
				[profile.tokenField]: maxTokens,
				...(profile.sendTemperature ? { temperature: request.temperature ?? 0.7 } : {}),
			};

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${auth.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (error) {
			const isTimeout =
				error instanceof Error &&
				(error.name === 'TimeoutError' || error.name === 'AbortError');
			throw new LlmError(
				isTimeout
					? `OpenAI request timed out after ${timeoutMs}ms`
					: error instanceof Error
						? error.message
						: 'OpenAI request failed',
				{
					code: isTimeout ? 'llm_timeout' : 'llm_provider_error',
					provider: 'openai',
					retryable: isTimeout,
				},
			);
		}

		const payload = (await response.json()) as OpenAIChatResponse & OpenAIResponsesPayload;

		if (!response.ok) {
			const message = payload.error?.message || `OpenAI request failed (${response.status})`;
			const billing = billingFailure(message) || payload.error?.code === 'insufficient_quota';
			throw new LlmError(message, {
				code: 'llm_provider_error',
				provider: 'openai',
				status: response.status,
				retryable: !billing && (response.status === 429 || response.status >= 500),
			});
		}

		const content = profile.api === 'responses' ? responseText(payload) : payload.choices?.[0]?.message?.content;
		if (!content) {
			const reason = payload.incomplete_details?.reason;
			throw new LlmError(reason ? `OpenAI returned empty content (${reason})` : 'OpenAI returned empty content', {
				code: 'llm_empty_response',
				provider: 'openai',
			});
		}

		let parsed: T;
		try {
			parsed = JSON.parse(content) as T;
		} catch {
			throw new LlmError('OpenAI returned invalid JSON', {
				code: 'llm_invalid_json',
				provider: 'openai',
			});
		}

		return {
			data: parsed,
			provider: 'openai',
			model: payload.model || request.model,
			rawUsage: {
				promptTokens: payload.usage?.prompt_tokens ?? payload.usage?.input_tokens,
				completionTokens: payload.usage?.completion_tokens ?? payload.usage?.output_tokens,
			},
		};
	},
};
