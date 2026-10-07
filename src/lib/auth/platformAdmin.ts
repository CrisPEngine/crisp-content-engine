import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';

/** Sentinel used when platform admins bypass plan/agent quotas in API responses. */
export const UNLIMITED_USAGE_CAP = 999_999;

const testOverrides = new Map<string, boolean>();

export function setPlatformSuperAdminOverrideForTests(userId: string | null, value?: boolean): void {
	if (userId === null) {
		testOverrides.clear();
		return;
	}
	if (value === undefined) {
		testOverrides.delete(userId);
		return;
	}
	testOverrides.set(userId, value);
}

/**
 * Platform super admins are identified by `profiles.is_admin = true` (same flag as the admin UI).
 */
export async function isPlatformSuperAdmin(userId: string): Promise<boolean> {
	if (testOverrides.has(userId)) {
		return testOverrides.get(userId)!;
	}

	const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !serviceKey) {
		return false;
	}

	const admin = getSupabaseService();
	const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
	if (error) {
		console.warn('[platformAdmin] Failed to load profile for admin check:', error.message);
		return false;
	}
	return data?.is_admin === true;
}

export async function bypassesUsageLimits(userId: string): Promise<boolean> {
	return isPlatformSuperAdmin(userId);
}
