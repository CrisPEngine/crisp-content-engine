import { NextResponse } from 'next/server';
import { requireOperatorAuth } from '@/lib/operator/auth';
import { assertOperatorConsoleEnabled } from '@/lib/operator/enabled';
import { OperatorActionError } from '@/lib/operator/actions/errors';
import { assertActorCanRunAction } from '@/lib/operator/actions/permissions';
import { getSupabaseService } from '@/lib/supabaseService';

export const runtime = 'nodejs';

const availableActions = [
	'create_or_update_brand_profile',
	'generate_or_refresh_brand_strategy',
	'generate_content_batch',
	'regenerate_individual_post',
	'update_content_status',
	'send_item_to_approval',
	'schedule_approved_content',
	'fetch_brand_content_queue',
	'fetch_operator_logs',
] as const;

async function getLogStatus() {
	try {
		const admin = getSupabaseService();
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const { count: recentActionCount, error: countError } = await admin
			.from('operator_action_logs')
			.select('id', { count: 'exact', head: true })
			.gte('created_at', since);

		if (countError) {
			return {
				available: false,
				recentActionCount: 0,
				recentErrorCount: 0,
				error: countError.message,
			};
		}

		const { count: recentErrorCount, error: errorCountError } = await admin
			.from('operator_action_logs')
			.select('id', { count: 'exact', head: true })
			.eq('status', 'failed')
			.gte('created_at', since);

		return {
			available: !errorCountError,
			recentActionCount: recentActionCount ?? 0,
			recentErrorCount: recentErrorCount ?? 0,
			error: errorCountError?.message,
		};
	} catch (error) {
		return {
			available: false,
			recentActionCount: 0,
			recentErrorCount: 0,
			error: error instanceof Error ? error.message : 'Unable to check logging status',
		};
	}
}

export async function GET(request: Request) {
	try {
		assertOperatorConsoleEnabled();
		const actor = await requireOperatorAuth(request);
		assertActorCanRunAction(actor, 'fetch_operator_logs');

		const logging = await getLogStatus();
		const configuredScopes = process.env.OPERATOR_ALLOWED_SCOPES
			?.split(',')
			.map((scope) => scope.trim())
			.filter(Boolean);

		return NextResponse.json({
			ok: true,
			status: {
				system: logging.available ? 'ready' : 'degraded',
				supabaseLoggingAvailable: logging.available,
				operatorApiSecretConfigured: Boolean(process.env.OPERATOR_API_SECRET),
				scopeMode: configuredScopes && configuredScopes.length > 0
					? 'restricted_secret_scopes'
					: 'admin_full_access_secret_full_access',
				allowedSecretScopes: configuredScopes && configuredScopes.length > 0 ? configuredScopes : null,
				availableActions,
				recentActionCount: logging.recentActionCount,
				recentErrorCount: logging.recentErrorCount,
				loggingError: logging.error,
				actor: {
					type: actor.type,
					id: actor.id,
					scopes: actor.scopes,
				},
			},
		});
	} catch (error) {
		if (error instanceof OperatorActionError) {
			return NextResponse.json(
				{
					ok: false,
					error: error.message,
					code: error.code,
					details: error.details,
				},
				{ status: error.status }
			);
		}

		return NextResponse.json(
			{
				ok: false,
				error: error instanceof Error ? error.message : 'Server error',
			},
			{ status: 500 }
		);
	}
}
