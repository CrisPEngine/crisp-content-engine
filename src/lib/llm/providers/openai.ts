import 'server-only';

import type { LlmAuthContext, LlmProvider, StructuredJsonRequest, StructuredJsonResult } from '../types';
import { LlmError } from '../types';

type OpenAIChatResponse = {
	choices?: Array<{ message?: { content?: string } }>;
	usage?: { prompt_tokens?: number; completion_tokens?: number };
	error?: { message?: string; type?: string };
};

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
		let response: Response;
		try {
			response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${auth.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: request.model,
					messages: request.messages,
					temperature: request.temperature ?? 0.7,
					max_tokens: request.maxTokens ?? 2048,
					response_format: { type: 'json_object' },
				}),
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

		const payload = (await response.json()) as OpenAIChatResponse;

		if (!response.ok) {
			const message = payload.error?.message || `OpenAI request failed (${response.status})`;
			throw new LlmError(message, {
				code: 'llm_provider_error',
				provider: 'openai',
				status: response.status,
				retryable: response.status === 429 || response.status >= 500,
			});
		}

		const content = payload.choices?.[0]?.message?.content;
		if (!content) {
			throw new LlmError('OpenAI returned empty content', {
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
			model: request.model,
			rawUsage: {
				promptTokens: payload.usage?.prompt_tokens,
				completionTokens: payload.usage?.completion_tokens,
			},
		};
	},
};
