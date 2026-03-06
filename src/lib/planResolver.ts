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

		// If DB plan is wrong/stale, fall back to entitlements (common symptom: Scale users showing Starter UI)
		if (!isKnownPlan(planFromSubscription) || planFromSubscription === 'starter') {
			const { data: entitlements } = await admin
				.from('entitlements')
				.select('max_brands')
				.eq('user_id', userId)
				.maybeSingle();

			if (entitlements?.max_brands != null) {
				const mb = entitlements.max_brands;
				const planFromEntitlements: PlanId =
					mb >= 20 ? 'scale' : mb >= 5 ? 'pro' : mb >= 2 ? 'growth' : 'starter';

				if (planFromEntitlements !== 'starter') {
					return {
						plan: planFromEntitlements,
						cycle: subscription.cycle as 'monthly' | 'annual',
						isEmailVerified,
					};
				}
			}
		}

		return {
			plan: (planFromSubscription as PlanId) || 'creator',
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

	// Priority 3: No subscription but has entitlements (admin-set plan)
	if (!subscription && isEmailVerified) {
		const { data: entitlements } = await admin
			.from('entitlements')
			.select('max_brands')
			.eq('user_id', userId)
			.maybeSingle();
		if (entitlements?.max_brands != null) {
			const mb = entitlements.max_brands;
			const plan: PlanId = mb >= 20 ? 'scale' : mb >= 5 ? 'pro' : mb >= 2 ? 'growth' : 'starter';
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
