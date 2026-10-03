/**
 * AI invocation logging. Never logs prompts, completions, or credentials.
 */

export type AiInvocationLog = {
	requestId: string;
	role: string;
	provider: string;
	model: string;
	fallbackUsed: boolean;
	promptTokens?: number;
	completionTokens?: number;
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
		model: entry.model,
		fallback_used: entry.fallbackUsed,
		prompt_tokens: entry.promptTokens,
		completion_tokens: entry.completionTokens,
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
		await supabase.from('ai_usage_logs').insert({
			user_id: entry.userId ?? null,
			request_id: entry.requestId,
			role: entry.role,
			provider: entry.provider,
			model: entry.model,
			fallback_used: entry.fallbackUsed,
			prompt_tokens: entry.promptTokens ?? null,
			completion_tokens: entry.completionTokens ?? null,
			duration_ms: entry.durationMs,
			ok: entry.ok,
			error_code: entry.errorCode ?? null,
			feature: entry.feature ?? null,
		});
	} catch {
		// Table may not be applied yet; ignore.
	}
}
