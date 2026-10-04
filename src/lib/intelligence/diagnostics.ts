/**
 * Production smoke checks. Never returns secret values — only configured/missing.
 */

import { MODEL_ROLES, resolveModelForRole } from '@/lib/ai/roles';
import { nativeIntelligenceBrandAllowlist } from '@/lib/featureFlags';

export type DiagnosticCheck = {
	id: string;
	ok: boolean;
	severity: 'critical' | 'important' | 'info';
	detail: string;
};

function present(value: string | undefined): boolean {
	return Boolean(value?.trim());
}

export function runConfigDiagnostics(): DiagnosticCheck[] {
	return [
		{
			id: 'supabase_url',
			ok: present(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
			severity: 'critical',
			detail: 'Supabase URL configured',
		},
		{
			id: 'supabase_service_role',
			ok: present(process.env.SUPABASE_SERVICE_ROLE_KEY),
			severity: 'critical',
			detail: 'Service role key configured (server-only)',
		},
		{
			id: 'openai',
			ok: present(process.env.OPENAI_API_KEY),
			severity: 'critical',
			detail: 'OPENAI_API_KEY configured for native LLM',
		},
		{
			id: 'airtable',
			ok: present(process.env.AIRTABLE_PAT) && present(process.env.AIRTABLE_BASE_ID) && present(process.env.AIRTABLE_BRANDPROFILES_TABLE),
			severity: 'critical',
			detail: 'Airtable BrandProfiles still configured (live CMS)',
		},
		{
			id: 'airtable_queue',
			ok: present(process.env.AIRTABLE_CONTENTQUEUE_TABLE),
			severity: 'critical',
			detail: 'Airtable ContentQueue still configured',
		},
		{
			id: 'make_strategy',
			ok: present(process.env.MAKE_STRATEGY_WEBHOOK_URL),
			severity: 'critical',
			detail: 'Make strategy webhook still configured',
		},
		{
			id: 'make_content',
			ok: present(process.env.MAKE_MULTI_CHANNEL_CONTENT_GENERATION_WEBHOOK_URL) || present(process.env.MAKE_CONTENT_GENERATION_WEBHOOK_URL),
			severity: 'critical',
			detail: 'Make content generation webhook still configured',
		},
		{
			id: 'native_intelligence_pilot',
			ok: process.env.NATIVE_INTELLIGENCE_ENABLED !== 'true' || nativeIntelligenceBrandAllowlist().length > 0,
			severity: 'info',
			detail: process.env.NATIVE_INTELLIGENCE_ENABLED === 'true'
				? `Native intelligence canonical brand allowlist: ${nativeIntelligenceBrandAllowlist().join(', ') || 'empty, so no brand is enabled'}`
				: 'Native intelligence pilot is off. Make generation is unchanged.',
		},
		{
			id: 'linkedin_oauth',
			ok: present(process.env.LINKEDIN_CLIENT_ID) && present(process.env.LINKEDIN_CLIENT_SECRET),
			severity: 'important',
			detail: 'LinkedIn OAuth client configured',
		},
		{
			id: 'linkedin_encryption',
			ok: present(process.env.LINKEDIN_ENCRYPTION_KEY),
			severity: 'important',
			detail: 'LinkedIn token encryption key configured',
		},
		{
			id: 'cron_secret',
			ok: present(process.env.CRON_SECRET),
			severity: 'important',
			detail: 'CRON_SECRET configured for publishers and job processing',
		},
		{
			id: 'sidecar_model_role',
			ok: resolveModelForRole('SIDECAR') !== 'gpt-4o-mini',
			severity: 'info',
			detail: `Sidecar role resolves to ${resolveModelForRole('SIDECAR')}`,
		},
		{
			id: 'telegram_bot',
			ok: present(process.env.TELEGRAM_BOT_SECRET || process.env.INTELLIGENCE_BOT_SECRET),
			severity: 'info',
			detail: 'Telegram bot secret configured',
		},
		{
			id: 'telegram_user_map',
			ok: present(process.env.TELEGRAM_USER_MAP),
			severity: 'info',
			detail: 'TELEGRAM_USER_MAP configured (telegramId:userId pairs)',
		},
		{
			id: 'article_webhook',
			ok: present(process.env.ARTICLE_PUBLISH_WEBHOOK_URL),
			severity: 'info',
			detail: 'Generic article webhook configured',
		},
	];
}

export function runModelRoleDiagnostics(): DiagnosticCheck[] {
	return MODEL_ROLES.map((role) => ({
		id: `model_role_${role.toLowerCase()}`,
		ok: Boolean(resolveModelForRole(role)),
		severity: 'info' as const,
		detail: `${role} → ${resolveModelForRole(role)}`,
	}));
}

export async function pingIntelligenceTables(): Promise<DiagnosticCheck> {
	try {
		const { getSupabaseService } = await import('@/lib/supabaseService');
		const supabase = getSupabaseService();
		const { error } = await supabase.from('brand_brains').select('id').limit(1);
		if (error) {
			return {
				id: 'intelligence_tables',
				ok: false,
				severity: 'critical',
				detail: `brand_brains not readable: ${error.message}. Apply 023/024 migrations.`,
			};
		}
		return {
			id: 'intelligence_tables',
			ok: true,
			severity: 'critical',
			detail: 'brand_brains readable',
		};
	} catch (error) {
		return {
			id: 'intelligence_tables',
			ok: false,
			severity: 'critical',
			detail: error instanceof Error ? error.message : 'Supabase ping failed',
		};
	}
}

export async function runProductionSmoke(): Promise<{
	ok: boolean;
	checks: DiagnosticCheck[];
	failedCritical: string[];
}> {
	const checks = [...runConfigDiagnostics(), ...runModelRoleDiagnostics(), await pingIntelligenceTables()];
	const failedCritical = checks.filter((check) => !check.ok && check.severity === 'critical').map((check) => check.id);
	return {
		ok: failedCritical.length === 0,
		checks,
		failedCritical,
	};
}
