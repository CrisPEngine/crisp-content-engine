import { NextResponse } from 'next/server';
import { MODEL_ROLES, getRoleConfig } from '@/lib/ai/roles';
import { runProductionSmoke } from '@/lib/intelligence/diagnostics';
import { jsonError, requireIntelligenceUserOrCron } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		await requireIntelligenceUserOrCron(request);
		const smoke = await runProductionSmoke();
		const { getSupabaseService } = await import('@/lib/supabaseService');
		const { data: recent } = await getSupabaseService()
			.from('ai_usage_logs')
			.select('role, provider, model, fallback_used, error_code, duration_ms, ok, feature, created_at')
			.order('created_at', { ascending: false })
			.limit(20);
		return NextResponse.json({
			ok: smoke.ok,
			roles: MODEL_ROLES.map((role) => {
				const config = getRoleConfig(role);
				return {
					role,
					provider: 'openai',
					preferredModel: config.preferred,
					fallbacks: config.fallbacks,
					reasoningEffort: config.reasoningEffort,
				};
			}),
			failedCritical: smoke.failedCritical,
			checks: smoke.checks.map((check) => ({
				id: check.id,
				ok: check.ok,
				severity: check.severity,
				detail: check.detail,
			})),
			recentInvocations: recent ?? [],
		});
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
