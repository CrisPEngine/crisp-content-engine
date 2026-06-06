/**
 * Server-only LLM provider abstraction.
 * Designed for workspace-level keys today; BYO user/workspace keys can extend LlmAuthContext later.
 */

export type LlmProviderId = 'openai' | 'anthropic' | 'gemini';

/** Credentials resolved server-side — never sent to clients. */
export type LlmAuthContext = {
	provider: LlmProviderId;
	/** Workspace / service API key (current MVP). */
	apiKey: string;
	/** Optional future: per-user or per-workspace override. */
	userId?: string;
	workspaceId?: string;
};

export type LlmMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

export type StructuredJsonRequest = {
	model: string;
	messages: LlmMessage[];
	/** Provider-specific JSON schema hint when supported. */
	jsonSchemaHint?: string;
	temperature?: number;
	maxTokens?: number;
	/** Hard timeout for the provider HTTP call (ms). */
	timeoutMs?: number;
};

export type StructuredJsonResult<T> = {
	data: T;
	provider: LlmProviderId;
	model: string;
	rawUsage?: {
		promptTokens?: number;
		completionTokens?: number;
	};
};

export type LlmProvider = {
	id: LlmProviderId;
	completeStructuredJson<T>(request: StructuredJsonRequest, auth: LlmAuthContext): Promise<StructuredJsonResult<T>>;
};

export class LlmError extends Error {
	readonly code: string;
	readonly provider?: LlmProviderId;
	readonly status?: number;
	readonly retryable: boolean;

	constructor(
		message: string,
		options: { code: string; provider?: LlmProviderId; status?: number; retryable?: boolean },
	) {
		super(message);
		this.name = 'LlmError';
		this.code = options.code;
		this.provider = options.provider;
		this.status = options.status;
		this.retryable = options.retryable ?? false;
	}
}
