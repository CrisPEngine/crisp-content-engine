import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { OperatorActionError } from './actions/errors';
import type { OperatorActor } from './actions/logger';
import { operatorScopes, type OperatorScope } from './actions/permissions';

function safeEqual(a: string, b: string) {
	if (a.length !== b.length) return false;

	let result = 0;
	for (let i = 0; i < a.length; i += 1) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

async function getAdminActorFromSession(): Promise<OperatorActor | null> {
	const supabase = await createClient();
	const {
		data: { user },
		error,
	} = await supabase.auth.getUser();

	if (error || !user) return null;

	const admin = getSupabaseService();
	const { data: profile, error: profileError } = await admin
		.from('profiles')
		.select('is_admin, email')
		.eq('id', user.id)
		.maybeSingle();

	if (profileError) {
		throw new OperatorActionError('Failed to verify operator permissions', {
			status: 500,
			code: 'operator_auth_profile_check_failed',
			details: profileError,
		});
	}

	if (!profile?.is_admin) {
		throw new OperatorActionError('Admin access required', {
			status: 403,
			code: 'operator_admin_required',
		});
	}

	return {
		type: 'admin_session',
		id: user.id,
		email: profile.email || user.email,
		scopes: [...operatorScopes],
	};
}

function parseAllowedScopes(): OperatorScope[] {
	const configured = process.env.OPERATOR_ALLOWED_SCOPES;
	if (!configured) return [...operatorScopes];

	const allowed = new Set<OperatorScope>();
	const validScopes = new Set<string>(operatorScopes);
	for (const scope of configured.split(',').map((value) => value.trim()).filter(Boolean)) {
		if (validScopes.has(scope)) {
			allowed.add(scope as OperatorScope);
		}
	}

	return [...allowed];
}

export async function requireOperatorAuth(request: Request): Promise<OperatorActor> {
	const configuredSecret = process.env.OPERATOR_API_SECRET;
	const suppliedSecret = request.headers.get('x-operator-secret');

	if (configuredSecret && suppliedSecret && safeEqual(suppliedSecret, configuredSecret)) {
		return {
			type: 'operator_secret',
			id: 'operator-service',
			scopes: parseAllowedScopes(),
		};
	}

	const actor = await getAdminActorFromSession();
	if (actor) return actor;

	throw new OperatorActionError('Not authenticated', {
		status: 401,
		code: 'operator_not_authenticated',
	});
}
