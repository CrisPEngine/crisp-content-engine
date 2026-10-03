import { describe, expect, it } from 'vitest';
import { LlmError } from '@/lib/llm';
import { classifyLlmFailure, mayFallback } from '../complete';

describe('LLM fallback classification', () => {
	it('allows fallback only for transient provider failures', () => {
		expect(mayFallback(classifyLlmFailure(new LlmError('slow', { code: 'llm_timeout', provider: 'openai', retryable: true })))).toBe(true);
		expect(mayFallback(classifyLlmFailure(new LlmError('rate', { code: 'llm_provider_error', provider: 'openai', status: 429, retryable: true })))).toBe(true);
		expect(mayFallback(classifyLlmFailure(new LlmError('down', { code: 'llm_provider_error', provider: 'openai', status: 503, retryable: true })))).toBe(true);
	});

	it('does not fall back on auth, schema, malformed, or invalid model errors', () => {
		const blocked = [
			new LlmError('no key', { code: 'llm_missing_api_key', provider: 'openai' }),
			new LlmError('bad json', { code: 'llm_invalid_json', provider: 'openai' }),
			new LlmError('bad request', { code: 'llm_provider_error', provider: 'openai', status: 400 }),
			new LlmError('model_not_found', { code: 'llm_provider_error', provider: 'openai', status: 404 }),
			new LlmError('unauthorized', { code: 'llm_provider_error', provider: 'openai', status: 401 }),
			new LlmError('You have no credits remaining. Add credits to continue.', {
				code: 'llm_provider_error',
				provider: 'openai',
				status: 429,
				retryable: true,
			}),
			new Error('bug'),
		];
		for (const error of blocked) {
			expect(mayFallback(classifyLlmFailure(error))).toBe(false);
		}
	});
});
