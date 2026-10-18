import 'server-only';

import { listRecords } from '@/lib/airtable/client';
import { UNLIMITED_USAGE_CAP, bypassesUsageLimits } from '@/lib/auth/platformAdmin';
import { capsFor } from '@/lib/billing';
import type { PlanId } from '@/config/pricing';
import { getEntitlements } from '@/lib/enforceCaps';
import { getSupabaseService } from '@/lib/supabaseService';
import { resolvePlan } from '@/lib/planResolver';

export type BrandLimitCheck = {
	ok: boolean;
	reason?: string;
	maxBrands: number;
	currentCount: number;
	platformAdmin: boolean;
};

export class BrandLimitReachedError extends Error {
	readonly code = 'brand_limit_reached';
	readonly status = 403;
	readonly maxBrands: number;
	readonly currentCount: number;

	constructor(check: BrandLimitCheck) {
		super(check.reason ?? 'Brand limit reached.');
		this.name = 'BrandLimitReachedError';
		this.maxBrands = check.maxBrands;
		this.currentCount = check.currentCount;
	}
}

function brandLimitMessage(maxBrands: number): string {
	return `You've reached the maximum number of brands for your plan (${maxBrands} brand${maxBrands !== 1 ? 's' : ''}). Please upgrade your package or create a new account to add more brands.`;
}

async function getAirtableBrandCount(userId: string): Promise<number | null> {
	const TABLE_ID = process.env.AIRTABLE_BRANDPROFILES_TABLE;
	if (!process.env.AIRTABLE_PAT || !process.env.AIRTABLE_BASE_ID || !TABLE_ID) {
		return null;
	}
	try {
		const records = await listRecords({
			table: TABLE_ID,
			filterByFormula: `{user_id} = "${userId}"`,
			fields: ['user_id'],
			cache: false,
			endpoint: '/lib/brandLimits',
		});
		return records.length;
	} catch (error) {
		console.warn('[brandLimits] Failed to count Airtable brands:', error);
		return null;
	}
}

/** How many brands this user already owns (native store and Airtable, whichever is higher). */
export async function getOwnedBrandCount(userId: string): Promise<number> {
	const supabase = getSupabaseService();
	const { count } = await supabase
		.from('brand_brains')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId);
	const native = count ?? 0;
	const airtable = await getAirtableBrandCount(userId);
	if (airtable === null) {
		return native;
	}
	return Math.max(native, airtable);
}

/** Plan entitlements cap for brands. Platform super admins get unlimited headroom. */
export async function getMaxBrandsForUser(userId: string): Promise<number> {
	if (await bypassesUsageLimits(userId)) {
		return UNLIMITED_USAGE_CAP;
	}

	try {
		const entitlements = await getEntitlements(userId);
		if (entitlements?.max_brands != null) {
			return entitlements.max_brands;
		}
	} catch {
		// Fall through to plan caps when entitlements row is missing.
	}

	const resolved = await resolvePlan(userId);
	const planId: PlanId | null = resolved.plan === 'free' ? null : resolved.plan;
	if (planId) {
		return capsFor(planId).max_brands;
	}
	return capsFor('starter').max_brands;
}

/**
 * Returns whether the user may create or activate another brand.
 * Pass forAirtableBrandId when activating an existing profile (does not consume a slot).
 */
export async function enforceBrandLimit(
	userId: string,
	opts?: { forAirtableBrandId?: string },
): Promise<BrandLimitCheck> {
	const platformAdmin = await bypassesUsageLimits(userId);
	const maxBrands = await getMaxBrandsForUser(userId);

	if (platformAdmin) {
		const currentCount = await getOwnedBrandCount(userId);
		return { ok: true, maxBrands, currentCount, platformAdmin: true };
	}

	const currentCount = await getOwnedBrandCount(userId);

	if (opts?.forAirtableBrandId) {
		const supabase = getSupabaseService();
		const { data: existing } = await supabase
			.from('brand_brains')
			.select('id')
			.eq('user_id', userId)
			.eq('airtable_brand_id', opts.forAirtableBrandId)
			.maybeSingle();
		if (existing) {
			return { ok: true, maxBrands, currentCount, platformAdmin: false };
		}
	}

	if (currentCount >= maxBrands) {
		return {
			ok: false,
			reason: brandLimitMessage(maxBrands),
			maxBrands,
			currentCount,
			platformAdmin: false,
		};
	}

	return { ok: true, maxBrands, currentCount, platformAdmin: false };
}

export async function assertCanAddBrand(
	userId: string,
	opts?: { forAirtableBrandId?: string },
): Promise<BrandLimitCheck> {
	const check = await enforceBrandLimit(userId, opts);
	if (!check.ok) {
		throw new BrandLimitReachedError(check);
	}
	return check;
}
