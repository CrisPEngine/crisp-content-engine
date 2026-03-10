/**
 * Plan Resolution and Starter (Free Forever) Provisioning
 *
 * Canonical plan resolver:
 * 1. Stripe subscription (if active) → paid plan
 * 2. Subscription row with plan=starter (no Stripe) → Starter (Free Forever)
 * 3. Entitlements set by admin → plan from entitlements
 * 4. No subscription → provision Starter for verified users, else free
 */

import { getSupabaseService } from './supabaseService';
import { capsFor } from './billing';
import type { PlanId } from '@/config/pricing';

type EntitlementsRow = {
	max_brands: number | null;
	max_seats?: number | null;
	max_channels?: number | null;
	posts_per_month?: number | null;
	linkedin_monthly?: number | null;
	x_monthly?: number | null;
	blog_monthly?: number | null;
	meta_pool_monthly?: number | null;
} | null;

function inferPlanFromEntitlements(e: EntitlementsRow): PlanId | null {
	if (!e) return null;

	// Prefer the most distinctive signals (posts + meta pool), then fall back.
	const posts = typeof e.posts_per_month === 'number' ? e.posts_per_month : null;
	const metaPool = typeof e.meta_pool_monthly === 'number' ? e.meta_pool_monthly : null;
	const linkedin = typeof e.linkedin_monthly === 'number' ? e.linkedin_monthly : null;

	// Scale: unlimited sentinels
	if (posts != null && posts >= 999999) return 'scale';
	if (typeof e.max_brands === 'number' && e.max_brands >= 20) return 'scale';

	// Pro: 75 meta pool / 312 posts
	if (metaPool != null && metaPool >= 75) return 'pro';
	if (posts != null && posts >= 312) return 'pro';

	// Growth: 20 meta pool / 84 posts
	if (metaPool != null && metaPool >= 20) return 'growth';
	if (posts != null && posts >= 84) return 'growth';

	// Creator: 26 posts / 12 LinkedIn
	if (posts != null && posts >= 26) return 'creator';
	if (linkedin != null && linkedin >= 12) return 'creator';

	// Starter: everything else (incl. nulls when partially provisioned)
	return 'starter';
}

export type ResolvedPlan = {
	plan: PlanId | 'free';
	cycle?: 'monthly' | 'annual';
	isEmailVerified: boolean;
};

/**
 * Resolve user's current plan with auto-provisioning
 *
 * Priority:
 * 1. Stripe subscription (paid plan)
 * 2. Subscription with plan=starter (Free Forever, no Stripe)
 * 3. Entitlements only (admin-set plan)
 * 4. No subscription → provision Starter for verified users, else free
 */
export async function resolvePlan(userId: string): Promise<ResolvedPlan> {
	const admin = getSupabaseService();

	const { data: authUser } = await admin.auth.admin.getUserById(userId);
	const isEmailVerified = !!authUser?.user?.email_confirmed_at;

	const { data: subscription } = await admin
		.from('subscriptions')
		.select('plan, cycle, stripe_subscription_id, current_period_end, trial_start_at, trial_end_at')
		.eq('user_id', userId)
		.maybeSingle();

	// Priority 1: Stripe subscription (paid plan)
	if (subscription?.stripe_subscription_id) {
		const planFromSubscription = subscription.plan as string | null | undefined;
		const isKnownPlan = (p: unknown): p is PlanId =>
			p === 'starter' || p === 'creator' || p === 'growth' || p === 'pro' || p === 'scale';

		const { data: entitlements } = await admin
			.from('entitlements')
			.select('max_brands, posts_per_month, linkedin_monthly, x_monthly, blog_monthly, meta_pool_monthly, max_channels')
			.eq('user_id', userId)
			.maybeSingle();

		const planFromEntitlements = inferPlanFromEntitlements((entitlements as any) || null);
		const rank: Record<PlanId, number> = {
			starter: 0,
			creator: 1,
			growth: 2,
			pro: 3,
			scale: 4,
		};

		const subPlan: PlanId | null = isKnownPlan(planFromSubscription) ? planFromSubscription : null;
		let resolved: PlanId = (planFromSubscription as PlanId) || 'creator';

		if (planFromEntitlements && (!subPlan || rank[planFromEntitlements] > rank[subPlan])) {
			resolved = planFromEntitlements;
		} else if (subPlan) {
			resolved = subPlan;
		}

		// Paying Stripe customers must never be shown as Starter (avoids stale DB / entitlements)
		if (resolved === 'starter') {
			resolved = 'creator';
		}

		return {
			plan: resolved,
			cycle: subscription.cycle as 'monthly' | 'annual',
			isEmailVerified,
		};
	}

	// Priority 2: Subscription row with plan=starter (Free Forever)
	if (subscription?.plan === 'starter') {
		return {
			plan: 'starter',
			cycle: (subscription.cycle as 'monthly' | 'annual') || 'monthly',
			isEmailVerified,
		};
	}

	// Legacy: subscription with plan=trial or trial_end_at in future — treat as starter
	const trialEndAt = subscription && 'trial_end_at' in subscription ? (subscription as { trial_end_at?: string }).trial_end_at : null;
	if ((subscription?.plan === 'trial' || trialEndAt) && trialEndAt && new Date(trialEndAt) > new Date()) {
		return {
			plan: 'starter',
			cycle: 'monthly',
			isEmailVerified,
		};
	}

	// Subscription row has a paid plan but no Stripe ID (e.g. admin-assigned scale) — honour it
	const knownPaid = ['creator', 'growth', 'pro', 'scale'] as const;
	if (subscription?.plan && knownPaid.includes(subscription.plan as any)) {
		return {
			plan: subscription.plan as PlanId,
			cycle: (subscription.cycle as 'monthly' | 'annual') || 'monthly',
			isEmailVerified,
		};
	}

	// Priority 3: No subscription but has entitlements (admin-set plan)
	if (!subscription && isEmailVerified) {
		const { data: entitlements } = await admin
			.from('entitlements')
			.select('max_brands, posts_per_month, linkedin_monthly, x_monthly, blog_monthly, meta_pool_monthly, max_channels')
			.eq('user_id', userId)
			.maybeSingle();
		const plan = inferPlanFromEntitlements((entitlements as any) || null);
		if (plan) {
			return {
				plan,
				isEmailVerified,
			};
		}
	}

	// Priority 4: No subscription → provision Starter for verified users
	if (isEmailVerified && !subscription) {
		await provisionStarter(userId);
		const { data: newSub } = await admin
			.from('subscriptions')
			.select('plan, cycle')
			.eq('user_id', userId)
			.maybeSingle();
		if (newSub?.plan === 'starter') {
			return {
				plan: 'starter',
				cycle: (newSub.cycle as 'monthly' | 'annual') || 'monthly',
				isEmailVerified,
			};
		}
	}

	return {
		plan: 'free',
		isEmailVerified,
	};
}

/**
 * Provision Free Forever Starter for a user with no subscription
 */
async function provisionStarter(userId: string): Promise<void> {
	const admin = getSupabaseService();
	try {
		const { data: authUser } = await admin.auth.admin.getUserById(userId);
		const email = authUser?.user?.email;
		if (!email) {
			console.warn(`[Starter Provision] No email for user ${userId}`);
			return;
		}

		const { data: existingProfile } = await admin
			.from('profiles')
			.select('id')
			.eq('id', userId)
			.maybeSingle();
		if (!existingProfile) {
			await admin.from('profiles').insert({
				id: userId,
				email,
				full_name: authUser?.user?.user_metadata?.full_name || null,
				is_admin: false,
			});
		}

		const starterCaps = capsFor('starter');
		await admin.from('subscriptions').upsert({
			user_id: userId,
			plan: 'starter',
			cycle: 'monthly',
			trial_start_at: null,
			trial_end_at: null,
		});
		await admin.from('entitlements').upsert({
			user_id: userId,
			...starterCaps,
			updated_at: new Date().toISOString(),
		});
		console.log(`[Starter Provision] Provisioned Free Forever Starter for user ${userId}`);
	} catch (error) {
		console.error(`[Starter Provision] Failed for user ${userId}:`, error);
	}
}
