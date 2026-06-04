import 'server-only';

import { LlmError } from '@/lib/llm';
import { SidecarError } from './errors';

export function isAirtableClientError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.message.includes('Airtable API error');
}

export function mapLlmErrorToSidecar(error: LlmError): SidecarError {
	const codeByLlmCode: Record<string, string> = {
		llm_missing_api_key: 'sidecar_missing_openai_key',
		llm_provider_not_implemented: 'sidecar_invalid_llm_provider',
		llm_provider_mismatch: 'sidecar_invalid_llm_provider',
		llm_provider_error: 'sidecar_llm_request_failed',
		llm_empty_response: 'sidecar_llm_parse_failed',
		llm_invalid_json: 'sidecar_llm_parse_failed',
	};

	const code = codeByLlmCode[error.code] ?? 'sidecar_llm_request_failed';
	const status =
		error.code === 'llm_missing_api_key'
			? 503
			: error.status && error.status >= 400 && error.status < 600
				? error.status
				: 502;

	const messageByCode: Record<string, string> = {
		sidecar_missing_openai_key:
			'OpenAI is not configured on the server. Set OPENAI_API_KEY in Vercel (or .env.local for local dev).',
		sidecar_invalid_llm_provider:
			'LLM provider is not supported. Set LLM_PROVIDER=openai for Sidecar draft generation.',
		sidecar_llm_request_failed: 'The AI provider rejected or failed the draft request.',
		sidecar_llm_parse_failed: 'The AI response could not be parsed as valid JSON.',
	};

	return new SidecarError(messageByCode[code] ?? error.message, {
		status,
		code,
		details: { provider: error.provider, retryable: error.retryable },
	});
}

export function mapAirtableErrorToSidecar(error: unknown, context: string): SidecarError {
	const message = error instanceof Error ? error.message : String(error);
	return new SidecarError(`Failed to load brand profile from Airtable (${context})`, {
		status: 502,
		code: 'sidecar_brand_fetch_failed',
		details: { airtableMessage: message.slice(0, 500) },
	});
}

export function wrapUnknownDraftError(error: unknown): SidecarError {
	if (error instanceof SidecarError) return error;
	if (error instanceof LlmError) return mapLlmErrorToSidecar(error);
	if (isAirtableClientError(error)) return mapAirtableErrorToSidecar(error, 'resolve');
	return new SidecarError('Draft generation failed unexpectedly', {
		status: 500,
		code: 'sidecar_internal_error',
		details: {
			message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
		},
	});
}
