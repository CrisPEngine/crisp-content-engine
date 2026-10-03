/**
 * AI invocation logging. Never logs prompts, completions, or credentials.
 */

export type AiInvocationLog = {
	requestId: string;
	role: string;
	provider: string;
	model: string;
	fallbackUsed: boolean;
	fallbackReason?: string;
	requestedModel?: string;
	promptTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	estimatedCostUsd?: number | null;
	durationMs: number;
	ok: boolean;
	errorCode?: string;
	userId?: string;
	feature?: string;
};

export function logAiInvocation(entry: AiInvocationLog): void {
	console.info('[ai]', {
		request_id: entry.requestId,
		role: entry.role,
		provider: entry.provider,
		requested_model: entry.requestedModel,
		model: entry.model,
		fallback_used: entry.fallbackUsed,
		fallback_reason: entry.fallbackReason,
		prompt_tokens: entry.promptTokens,
		completion_tokens: entry.completionTokens,
		reasoning_tokens: entry.reasoningTokens,
		estimated_cost_usd: entry.estimatedCostUsd,
		duration_ms: entry.durationMs,
		ok: entry.ok,
		error_code: entry.errorCode,
		feature: entry.feature,
		user_id: entry.userId,
	});

	void persistUsage(entry).catch(() => {
		// Persistence is best-effort; console log above is the source of truth in-process.
	});
}

async function persistUsage(entry: AiInvocationLog): Promise<void> {
	if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
	if (!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.SUPABASE_URL) return;

	try {
		const { getSupabaseService } = await import('@/lib/supabaseService');
		const supabase = getSupabaseService();
		const row = {
			user_id: entry.userId ?? null,
			request_id: entry.requestId,
			role: entry.role,
			provider: entry.provider,
			model: entry.model,
			fallback_used: entry.fallbackUsed,
			prompt_tokens: entry.promptTokens ?? null,
			completion_tokens: entry.completionTokens ?? null,
			reasoning_tokens: entry.reasoningTokens ?? null,
			estimated_cost_usd: entry.estimatedCostUsd ?? null,
			duration_ms: entry.durationMs,
			ok: entry.ok,
			error_code: entry.ok && entry.fallbackReason
				? `fallback:${entry.fallbackReason}`
				: entry.errorCode ?? null,
			feature: entry.feature ?? null,
		};
		const inserted = await supabase.from('ai_usage_logs').insert(row);
		if (inserted.error && /reasoning_tokens|estimated_cost_usd/.test(inserted.error.message)) {
			const legacy: Record<string, unknown> = { ...row };
			delete legacy.reasoning_tokens;
			delete legacy.estimated_cost_usd;
			await supabase.from('ai_usage_logs').insert(legacy);
		}
	} catch {
		// Table may not be applied yet; ignore.
	}
}
