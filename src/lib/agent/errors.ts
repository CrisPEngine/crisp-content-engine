export class AgentError extends Error {
	readonly code: string;
	readonly status: number;
	readonly details?: Record<string, unknown>;
	readonly retryable: boolean;

	constructor(
		code: string,
		message: string,
		status = 400,
		details?: Record<string, unknown>,
		retryable = false,
	) {
		super(message);
		this.name = 'AgentError';
		this.code = code;
		this.status = status;
		this.details = details;
		this.retryable = retryable;
	}
}

export function agentErrorFromUnknown(error: unknown): AgentError {
	if (error instanceof AgentError) return error;
	const coded = error as { code?: string; status?: number; message?: string };
	if (coded?.code === 'native_intelligence_globally_disabled' || coded?.code === 'native_intelligence_brand_disabled' || coded?.code === 'native_intelligence_brand_not_enabled') {
		const code = coded.code === 'native_intelligence_brand_not_enabled' ? 'native_intelligence_brand_disabled' : coded.code;
		return new AgentError(code, coded.message || 'Native intelligence is not available.', coded.status ?? 403);
	}
	const message = error instanceof Error ? error.message : 'Agent action failed';
	if (/relation|schema cache|does not exist/i.test(message)) {
		return new AgentError(
			'agent_store_unavailable',
			'Agent control plane storage is not available. Apply migration 026.',
			503,
			undefined,
			true,
		);
	}
	if (/rate limit|429|insufficient_quota|billing/i.test(message)) {
		return new AgentError('ai_billing', 'The model provider rejected the request for billing or quota.', 402);
	}
	if (/timeout|provider|openai|ECONN/i.test(message)) {
		return new AgentError('ai_provider_unavailable', 'The model provider is unavailable.', 503, undefined, true);
	}
	return new AgentError('agent_action_failed', message, 500);
}
