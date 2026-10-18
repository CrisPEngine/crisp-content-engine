import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPlatformSuperAdminOverrideForTests, UNLIMITED_USAGE_CAP } from '@/lib/auth/platformAdmin';
import {
	assertCanAddBrand,
	BrandLimitReachedError,
	enforceBrandLimit,
	getMaxBrandsForUser,
} from '@/lib/brandLimits';

let mockBrandBrainCount = 0;

vi.mock('@/lib/supabaseService', () => ({
	getSupabaseService: () => ({
		from: (table: string) => {
			if (table === 'brand_brains') {
				return {
					select: (_cols: string, opts?: { count?: string; head?: boolean }) => ({
						eq: () => {
							if (opts?.head) {
								return Promise.resolve({ count: mockBrandBrainCount, error: null });
							}
							return {
								maybeSingle: () => Promise.resolve({ data: null, error: null }),
							};
						},
					}),
				};
			}
			return {
				select: () => ({
					eq: () => ({
						maybeSingle: () => Promise.resolve({ data: null, error: null }),
					}),
				}),
			};
		},
	}),
}));

vi.mock('@/lib/planResolver', () => ({
	resolvePlan: vi.fn(async () => ({ plan: 'creator', isEmailVerified: true })),
}));

vi.mock('@/lib/enforceCaps', () => ({
	getEntitlements: vi.fn(async (userId: string) => {
		if (userId === 'creator-with-entitlements') {
			return { max_brands: 1 };
		}
		if (userId === 'pro-user') {
			return { max_brands: 3 };
		}
		throw new Error('missing entitlements');
	}),
}));

describe('brand limits', () => {
	beforeEach(() => {
		mockBrandBrainCount = 0;
		setPlatformSuperAdminOverrideForTests(null);
	});

	afterEach(() => {
		setPlatformSuperAdminOverrideForTests(null);
	});

	it('returns unlimited max brands for platform super admins', async () => {
		setPlatformSuperAdminOverrideForTests('admin-user', true);
		await expect(getMaxBrandsForUser('admin-user')).resolves.toBe(UNLIMITED_USAGE_CAP);
	});

	it('uses entitlements max_brands for normal users when present', async () => {
		await expect(getMaxBrandsForUser('creator-with-entitlements')).resolves.toBe(1);
	});

	it('falls back to plan caps when entitlements are missing', async () => {
		await expect(getMaxBrandsForUser('creator-no-entitlements')).resolves.toBe(1);
	});

	it('lets super admins exceed the creator brand cap', async () => {
		setPlatformSuperAdminOverrideForTests('admin-user', true);
		mockBrandBrainCount = 3;
		const check = await enforceBrandLimit('admin-user');
		expect(check.ok).toBe(true);
		expect(check.platformAdmin).toBe(true);
		expect(check.maxBrands).toBe(UNLIMITED_USAGE_CAP);
	});

	it('blocks creator users at one brand', async () => {
		mockBrandBrainCount = 1;
		const check = await enforceBrandLimit('creator-with-entitlements');
		expect(check.ok).toBe(false);
		expect(check.maxBrands).toBe(1);
		expect(check.currentCount).toBe(1);
		expect(check.reason).toContain('maximum number of brands');
	});

	it('allows creator users with zero brands', async () => {
		mockBrandBrainCount = 0;
		const check = await enforceBrandLimit('creator-with-entitlements');
		expect(check.ok).toBe(true);
		expect(check.maxBrands).toBe(1);
	});

	it('still enforces pro tier brand caps for non-admin users', async () => {
		mockBrandBrainCount = 3;
		const check = await enforceBrandLimit('pro-user');
		expect(check.ok).toBe(false);
		expect(check.maxBrands).toBe(3);
	});

	it('throws BrandLimitReachedError from assertCanAddBrand when blocked', async () => {
		mockBrandBrainCount = 2;
		await expect(assertCanAddBrand('creator-with-entitlements')).rejects.toBeInstanceOf(BrandLimitReachedError);
	});
});
