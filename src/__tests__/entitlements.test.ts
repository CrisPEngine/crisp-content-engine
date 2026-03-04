/**
 * Unit tests for plan entitlement config and quota logic.
 *
 * Run with: npm test
 * (Requires vitest — already in devDependencies)
 */

import { describe, it, expect } from 'vitest';
import { CAPS, PRICING, type PlanId } from '../config/pricing';
import { capsFor } from '../lib/billing';

// ============================================================
// CAPS config structural tests
// ============================================================

describe('CAPS config', () => {
	const plans: PlanId[] = ['starter', 'creator', 'growth', 'pro', 'scale'];

	it('has an entry for every plan', () => {
		for (const plan of plans) {
			expect(CAPS[plan]).toBeDefined();
		}
	});

	it.each(plans)('%s: all required fields are present', (plan) => {
		const caps = CAPS[plan];
		expect(typeof caps.maxBrands).toBe('number');
		expect(typeof caps.maxSeats).toBe('number');
		expect(typeof caps.maxChannels).toBe('number');
		expect(typeof caps.linkedinPostsMonthly).toBe('number');
		expect(typeof caps.xPostsMonthly).toBe('number');
		expect(typeof caps.blogArticlesMonthly).toBe('number');
		expect(typeof caps.blogOutlinesMonthly).toBe('number');
		expect(typeof caps.metaPoolMonthly).toBe('number');
		expect(caps.makeScenario === 'starter' || caps.makeScenario === 'multi-channel').toBe(true);
	});

	it('Starter: free tier with correct quotas', () => {
		const { linkedinPostsMonthly, xPostsMonthly, blogArticlesMonthly, blogOutlinesMonthly, metaPoolMonthly, makeScenario, autopublishLinkedIn, autopublishMeta } = CAPS.starter;
		expect(linkedinPostsMonthly).toBe(4);
		expect(xPostsMonthly).toBe(4);
		expect(blogArticlesMonthly).toBe(1);
		expect(blogOutlinesMonthly).toBe(0);
		expect(metaPoolMonthly).toBe(0);
		expect(makeScenario).toBe('starter');
		expect(autopublishLinkedIn).toBe(false);
		expect(autopublishMeta).toBe(false);
	});

	it('Creator: LinkedIn autopublish, no Meta', () => {
		const caps = CAPS.creator;
		expect(caps.linkedinPostsMonthly).toBe(12);
		expect(caps.xPostsMonthly).toBe(12);
		expect(caps.blogArticlesMonthly).toBe(2);
		expect(caps.metaPoolMonthly).toBe(0);
		expect(caps.autopublishLinkedIn).toBe(true);
		expect(caps.autopublishMeta).toBe(false);
		expect(caps.makeScenario).toBe('multi-channel');
	});

	it('Growth: LinkedIn + Meta autopublish with correct pool quota', () => {
		const caps = CAPS.growth;
		expect(caps.linkedinPostsMonthly).toBe(20);
		expect(caps.xPostsMonthly).toBe(40);
		expect(caps.blogArticlesMonthly).toBe(4);
		expect(caps.metaPoolMonthly).toBe(20);
		expect(caps.maxBrands).toBe(1);
		expect(caps.autopublishLinkedIn).toBe(true);
		expect(caps.autopublishMeta).toBe(true);
		expect(caps.makeScenario).toBe('multi-channel');
	});

	it('Pro: materially higher than Growth (>3x on posting capacity)', () => {
		const growth = CAPS.growth;
		const pro = CAPS.pro;
		// LinkedIn: 75 vs 20 = 3.75x
		expect(pro.linkedinPostsMonthly / growth.linkedinPostsMonthly).toBeGreaterThanOrEqual(3);
		// X: 150 vs 40 = 3.75x
		expect(pro.xPostsMonthly / growth.xPostsMonthly).toBeGreaterThanOrEqual(3);
		// Blog: 12 vs 4 = 3x
		expect(pro.blogArticlesMonthly / growth.blogArticlesMonthly).toBeGreaterThanOrEqual(3);
		// Meta pool: 75 vs 20 = 3.75x
		expect(pro.metaPoolMonthly / growth.metaPoolMonthly).toBeGreaterThanOrEqual(3);
	});

	it('Pro: 3 brands, 2 seats', () => {
		expect(CAPS.pro.maxBrands).toBe(3);
		expect(CAPS.pro.maxSeats).toBe(2);
	});

	it('Pro: same channels as Growth', () => {
		const proP = CAPS.pro.includedPlatforms.slice().sort();
		const growthP = CAPS.growth.includedPlatforms.slice().sort();
		expect(proP).toEqual(growthP);
	});

	it('Starter: makeScenario is starter', () => {
		expect(CAPS.starter.makeScenario).toBe('starter');
	});

	it('Creator/Growth/Pro/Scale: makeScenario is multi-channel', () => {
		for (const plan of ['creator', 'growth', 'pro', 'scale'] as PlanId[]) {
			expect(CAPS[plan].makeScenario).toBe('multi-channel');
		}
	});

	it('Meta not available on Starter or Creator', () => {
		for (const plan of ['starter', 'creator'] as PlanId[]) {
			expect(CAPS[plan].metaPoolMonthly).toBe(0);
			expect(CAPS[plan].autopublishMeta).toBe(false);
			expect(CAPS[plan].includedPlatforms).not.toContain('facebook');
			expect(CAPS[plan].includedPlatforms).not.toContain('instagram');
		}
	});

	it('Meta available on Growth and Pro', () => {
		for (const plan of ['growth', 'pro'] as PlanId[]) {
			expect(CAPS[plan].metaPoolMonthly).toBeGreaterThan(0);
			expect(CAPS[plan].autopublishMeta).toBe(true);
			expect(CAPS[plan].includedPlatforms).toContain('facebook');
			expect(CAPS[plan].includedPlatforms).toContain('instagram');
		}
	});
});

// ============================================================
// perChannelLimits consistency tests
// ============================================================

describe('perChannelLimits consistency', () => {
	it('Starter perChannelLimits match monthly quota fields', () => {
		const caps = CAPS.starter;
		expect(caps.perChannelLimits?.linkedin).toBe(caps.linkedinPostsMonthly);
		expect(caps.perChannelLimits?.x).toBe(caps.xPostsMonthly);
		expect(caps.perChannelLimits?.blog).toBe(caps.blogArticlesMonthly);
	});

	it('Creator perChannelLimits match monthly quota fields', () => {
		const caps = CAPS.creator;
		expect(caps.perChannelLimits?.linkedin).toBe(caps.linkedinPostsMonthly);
		expect(caps.perChannelLimits?.x).toBe(caps.xPostsMonthly);
		expect(caps.perChannelLimits?.blog).toBe(caps.blogArticlesMonthly);
	});

	it('Growth perChannelLimits match monthly quota fields', () => {
		const caps = CAPS.growth;
		expect(caps.perChannelLimits?.linkedin).toBe(caps.linkedinPostsMonthly);
		expect(caps.perChannelLimits?.x).toBe(caps.xPostsMonthly);
		expect(caps.perChannelLimits?.blog).toBe(caps.blogArticlesMonthly);
		expect(caps.perChannelLimits?.meta_pool).toBe(caps.metaPoolMonthly);
	});
});

// ============================================================
// capsFor (billing.ts) tests
// ============================================================

describe('capsFor', () => {
	it('returns correct fields for starter', () => {
		const caps = capsFor('starter');
		expect(caps.max_brands).toBe(1);
		expect(caps.max_seats).toBe(1);
		expect(caps.image_gen).toBe(true);
		expect(caps.linkedin_monthly).toBe(4);
		expect(caps.x_monthly).toBe(4);
		expect(caps.meta_pool_monthly).toBe(0);
	});

	it('returns correct fields for growth', () => {
		const caps = capsFor('growth');
		expect(caps.max_brands).toBe(1);
		expect(caps.linkedin_monthly).toBe(20);
		expect(caps.x_monthly).toBe(40);
		expect(caps.blog_monthly).toBe(4);
		expect(caps.meta_pool_monthly).toBe(20);
	});

	it('returns correct fields for pro', () => {
		const caps = capsFor('pro');
		expect(caps.max_brands).toBe(3);
		expect(caps.max_seats).toBe(2);
		expect(caps.linkedin_monthly).toBe(75);
		expect(caps.meta_pool_monthly).toBe(75);
	});

	it('posts_per_month is a positive number for all plans', () => {
		const plans: PlanId[] = ['starter', 'creator', 'growth', 'pro'];
		for (const plan of plans) {
			expect(capsFor(plan).posts_per_month).toBeGreaterThan(0);
		}
	});
});

// ============================================================
// PRICING copy tests
// ============================================================

describe('PRICING copy', () => {
	it('Starter has no priceId (free forever)', () => {
		expect(PRICING.monthly.starter.priceId).toBe('');
		expect(PRICING.annual.starter.priceId).toBe('');
	});

	it('All paid plans have cta text', () => {
		for (const plan of ['creator', 'growth', 'pro', 'scale'] as const) {
			const p = PRICING.monthly[plan] as any;
			expect(typeof p.cta).toBe('string');
			expect(p.cta.length).toBeGreaterThan(0);
		}
	});

	it('Scale CTA mentions email', () => {
		expect(PRICING.monthly.scale.cta).toContain('enquiries@crispdigital.io');
	});

	it('Scale shows from price, not a fixed number', () => {
		expect(PRICING.monthly.scale.priceText).toContain('$99');
	});

	it('Growth and Pro have comingSoon items', () => {
		expect((PRICING.monthly.growth as any).comingSoon.length).toBeGreaterThan(0);
		expect((PRICING.monthly.pro as any).comingSoon.length).toBeGreaterThan(0);
	});

	it('Pro has correct monthly price', () => {
		expect(PRICING.monthly.pro.priceText).toBe('$49/mo');
	});

	it('Growth has correct monthly price', () => {
		expect(PRICING.monthly.growth.priceText).toBe('$29/mo');
	});

	it('Creator has correct monthly price', () => {
		expect(PRICING.monthly.creator.priceText).toBe('$15/mo');
	});

	it('Pro annual is 20% saving on monthly', () => {
		// $49/mo * 12 = $588, 20% off = $470.40 ≈ $470
		expect(PRICING.annual.pro.priceText).toBe('$470/yr');
	});

	it('Pro seats feature is marked as coming soon', () => {
		const proFeatures = PRICING.monthly.pro.features;
		const seatFeature = proFeatures.find((f) => f.toLowerCase().includes('seat'));
		expect(seatFeature).toBeDefined();
		expect(seatFeature).toContain('coming soon');
	});
});

describe('Scale plan sentinels', () => {
	it('Scale uses high sentinel values (999) not arbitrary hard limits', () => {
		expect(CAPS.scale.maxBrands).toBe(999);
		expect(CAPS.scale.maxSeats).toBe(999);
	});

	it('Scale quotas are effectively unlimited', () => {
		expect(CAPS.scale.linkedinPostsMonthly).toBeGreaterThan(9000);
		expect(CAPS.scale.metaPoolMonthly).toBeGreaterThan(9000);
	});
});

// ============================================================
// Quota enforcement logic (pure function tests)
// ============================================================

describe('quota enforcement logic', () => {
	function wouldExceedLimit(used: number, requested: number, limit: number): boolean {
		return used + requested > limit;
	}

	it('blocks when at limit', () => {
		expect(wouldExceedLimit(12, 1, 12)).toBe(true);
	});

	it('blocks when over limit', () => {
		expect(wouldExceedLimit(10, 5, 12)).toBe(true);
	});

	it('allows when under limit', () => {
		expect(wouldExceedLimit(10, 2, 12)).toBe(false);
	});

	it('allows when exactly at limit after request', () => {
		// 10 used + 2 requested = 12 = limit: just at the boundary, allowed
		expect(wouldExceedLimit(10, 2, 12)).toBe(false);
	});

	it('Meta pool is shared: combined FB+IG must not exceed pool', () => {
		const pool = 20;
		const fbApproved = 12;
		const igRequesting = 9;
		// 12 + 9 = 21 > 20: block
		expect(wouldExceedLimit(fbApproved, igRequesting, pool)).toBe(true);
	});

	it('Starter: Meta channel is disabled (limit = 0)', () => {
		const starterMetaLimit = CAPS.starter.metaPoolMonthly;
		expect(starterMetaLimit).toBe(0);
		// Any request > 0 with limit 0 should be blocked
		expect(wouldExceedLimit(0, 1, starterMetaLimit)).toBe(true);
	});
});
