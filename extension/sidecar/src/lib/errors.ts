export type ApiErrorKind =
	| 'missing_settings'
	| 'network'
	| 'cors'
	| 'unauthorized'
	| 'not_found'
	| 'disabled'
	| 'validation'
	| 'server'
	| 'unknown';

export class SidecarApiError extends Error {
	readonly kind: ApiErrorKind;
	readonly status?: number;
	readonly code?: string;
	readonly details?: unknown;

	constructor(
		message: string,
		options: { kind: ApiErrorKind; status?: number; code?: string; details?: unknown },
	) {
		super(message);
		this.name = 'SidecarApiError';
		this.kind = options.kind;
		this.status = options.status;
		this.code = options.code;
		this.details = options.details;
	}
}

export function classifyFetchError(error: unknown, status?: number, code?: string): SidecarApiError {
	if (error instanceof SidecarApiError) return error;

	const message = error instanceof Error ? error.message : String(error);
	const lower = message.toLowerCase();

	if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
		return new SidecarApiError(
			'Network error — check API URL, server is running, and host_permissions include your API host.',
			{ kind: 'cors', status },
		);
	}

	if (status === 401 || code === 'sidecar_not_authenticated') {
		return new SidecarApiError('Unauthorized — check Bearer token matches SIDECAR_API_SECRET.', {
			kind: 'unauthorized',
			status,
			code,
		});
	}

	if (status === 404 || code === 'sidecar_disabled') {
		return new SidecarApiError('Sidecar API disabled or not found — set SIDECAR_API_ENABLED=true on the server.', {
			kind: 'disabled',
			status,
			code,
		});
	}

	if (status === 400 || code === 'sidecar_validation_error') {
		return new SidecarApiError(message || 'Invalid request.', { kind: 'validation', status, code });
	}

	if (code === 'sidecar_missing_openai_key') {
		return new SidecarApiError(
			'Server missing OPENAI_API_KEY — add it in Vercel env vars (Sidecar uses server-side OpenAI, not Make).',
			{ kind: 'server', status: status ?? 503, code },
		);
	}
	if (code === 'sidecar_invalid_llm_provider') {
		return new SidecarApiError('Server LLM_PROVIDER must be openai for Sidecar drafts.', {
			kind: 'server',
			status: status ?? 503,
			code,
		});
	}
	if (code === 'sidecar_brand_fetch_failed' || code === 'sidecar_brand_not_found') {
		return new SidecarApiError(message || 'Brand could not be loaded from Airtable.', {
			kind: 'server',
			status: status ?? 502,
			code,
		});
	}
	if (code === 'sidecar_schema_validation_failed' || code === 'sidecar_llm_parse_failed') {
		return new SidecarApiError(
			message || 'AI returned an invalid draft shape — try Generate draft again.',
			{ kind: 'server', status: status ?? 502, code },
		);
	}
	if (code === 'sidecar_llm_request_failed') {
		return new SidecarApiError(message || 'AI provider request failed.', {
			kind: 'server',
			status: status ?? 502,
			code,
		});
	}

	if (status && status >= 500) {
		return new SidecarApiError(message || `Server error (${status}).`, { kind: 'server', status, code });
	}

	return new SidecarApiError(message || 'Request failed.', { kind: 'unknown', status, code });
}

export function formatApiErrorForUi(error: SidecarApiError): string {
	const parts = [error.message];
	if (error.kind) parts.push(`Type: ${error.kind}`);
	if (error.status) parts.push(`HTTP ${error.status}`);
	if (error.code) parts.push(`Code: ${error.code}`);
	return parts.join(' · ');
}
