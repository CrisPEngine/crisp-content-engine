import { describe, expect, it } from 'vitest';
import { LlmError } from '@/lib/llm';
import { mapLlmErrorToSidecar } from '../draftErrors';

describe('mapLlmErrorToSidecar', () => {
	it('maps missing API key to sidecar_missing_openai_key', () => {
		const err = new LlmError('OPENAI_API_KEY is not configured', {
			code: 'llm_missing_api_key',
			provider: 'openai',
		});
		const mapped = mapLlmErrorToSidecar(err);
		expect(mapped.code).toBe('sidecar_missing_openai_key');
		expect(mapped.status).toBe(503);
	});

	it('maps provider errors to sidecar_llm_request_failed', () => {
		const err = new LlmError('rate limit', {
			code: 'llm_provider_error',
			provider: 'openai',
			status: 429,
		});
		const mapped = mapLlmErrorToSidecar(err);
		expect(mapped.code).toBe('sidecar_llm_request_failed');
		expect(mapped.status).toBe(429);
	});
});
