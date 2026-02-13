/**
 * Plan Resolution and Trial Provisioning
 * 
 * Canonical plan resolver that determines user's current plan based on priority:
 * 1. Stripe subscription (if active)
 * 2. No-card trial (if verified and within trial window)
 * 3. Free (no entitlements)
 * 
 * Also handles lazy provisioning of trial for verified users.
 */

import { getSupabaseService } from './supabaseService';
import { capsFor } from './billing';
import type { PlanId } from '@/config/pricing';

export type ResolvedPlan = {
	plan: PlanId | 'free';
	cycle?: 'monthly' | 'annual';
	isEmailVerified: boolean;
	isTrial: boolean;
	trialDaysRemaining?: number;
	trialEndAt?: string;
};

/**
 * Resolve user's current plan with auto-provisioning
 * 
 * Priority:
 * 1. Stripe subscription (paid plan)
 * 2. Active no-card trial (if verified and within 7 days)
 * 3. Free (no entitlements)
 * 
 * Also provisions trial for newly verified users.
 */
export async function resolvePlan(userId: string): Promise<ResolvedPlan> {
	const admin = getSupabaseService();
	
	// Get auth user to check email verification
	const { data: authUser } = await admin.auth.admin.getUserById(userId);
	const isEmailVerified = !!authUser?.user?.email_confirmed_at;
	
	// Get subscription record
	const { data: subscription } = await admin
		.from('subscriptions')
		.select('plan, cycle, stripe_subscription_id, trial_start_at, trial_end_at, current_period_end')
		.eq('user_id', userId)
		.maybeSingle();
	
	// Priority 1: Stripe subscription (paid plan)
	if (subscription?.stripe_subscription_id) {
		return {
			plan: subscription.plan as PlanId,
			cycle: subscription.cycle as 'monthly' | 'annual',
			isEmailVerified,
			isTrial: false,
		};
	}
	
	// Priority 2: Active no-card trial
	if (subscription?.trial_end_at && isEmailVerified) {
		const now = new Date();
		const trialEndAt = new Date(subscription.trial_end_at);
		
		if (now < trialEndAt) {
			const daysRemaining = Math.ceil((trialEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			return {
				plan: 'trial',
				isEmailVerified,
				isTrial: true,
				trialDaysRemaining: daysRemaining,
				trialEndAt: subscription.trial_end_at,
			};
		}
	}
	
	// Priority 3: Provision trial for verified users who never had one
	if (isEmailVerified && !subscription?.trial_start_at && !subscription?.stripe_subscription_id) {
		await provisionTrial(userId);
		
		// Re-fetch subscription after provisioning
		const { data: newSubscription } = await admin
			.from('subscriptions')
			.select('plan, trial_start_at, trial_end_at')
			.eq('user_id', userId)
			.maybeSingle();
		
		if (newSubscription?.trial_end_at) {
			const now = new Date();
			const trialEndAt = new Date(newSubscription.trial_end_at);
			const daysRemaining = Math.ceil((trialEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			
			return {
				plan: 'trial',
				isEmailVerified,
				isTrial: true,
				trialDaysRemaining: daysRemaining,
				trialEndAt: newSubscription.trial_end_at,
			};
		}
	}
	
	// Default: Free plan (no entitlements)
	return {
		plan: 'free',
		isEmailVerified,
		isTrial: false,
	};
}

/**
 * Provision trial for a newly verified user
 * 
 * Creates:
 * - profiles row (if missing)
 * - trial subscription row with trial_start_at/trial_end_at
 * - trial_usage row (0 credits used)
 * - entitlements row with trial caps
 */
async function provisionTrial(userId: string): Promise<void> {
	const admin = getSupabaseService();
	
	try {
		// Get auth user email
		const { data: authUser } = await admin.auth.admin.getUserById(userId);
		const email = authUser?.user?.email;
		
		if (!email) {
			console.warn(`[Trial Provision] Cannot provision trial for user ${userId}: no email found`);
			return;
		}
		
		// Ensure profile exists
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
			console.log(`[Trial Provision] Created profile for user ${userId}`);
		}
		
		// Create trial subscription
		const now = new Date();
		const trialStartAt = now.toISOString();
		const trialEndAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
		
		await admin.from('subscriptions').upsert({
			user_id: userId,
			plan: 'trial',
			cycle: 'monthly', // Default, not really used for trial
			trial_start_at: trialStartAt,
			trial_end_at: trialEndAt,
			// No stripe_subscription_id (distinguishes trial from paid)
			// No current_period_end (not needed for trial)
		});
		
		// Create trial_usage row
		await admin.from('trial_usage').upsert({
			user_id: userId,
			linkedin_generated: 0,
			x_generated: 0,
		});
		
		// Create entitlements with trial caps
		const trialCaps = capsFor('trial');
		await admin.from('entitlements').upsert({
			user_id: userId,
			...trialCaps,
			updated_at: new Date().toISOString(),
		});
		
		console.log(`[Trial Provision] Successfully provisioned 7-day trial for user ${userId}`, {
			trialStartAt,
			trialEndAt,
			caps: trialCaps,
		});
	} catch (error) {
		console.error(`[Trial Provision] Failed to provision trial for user ${userId}:`, error);
		// Don't throw - let the user fall back to free plan
	}
}

/**
 * Get trial usage for a user
 */
export async function getTrialUsage(userId: string): Promise<{ linkedin: number; x: number } | null> {
	const admin = getSupabaseService();
	
	const { data } = await admin
		.from('trial_usage')
		.select('linkedin_generated, x_generated')
		.eq('user_id', userId)
		.maybeSingle();
	
	if (!data) return null;
	
	return {
		linkedin: data.linkedin_generated ?? 0,
		x: data.x_generated ?? 0,
	};
}

/**
 * Increment trial usage (called after generation completes)
 */
export async function incrementTrialUsage(
	userId: string,
	channels: { linkedin?: number; x?: number }
): Promise<void> {
	const admin = getSupabaseService();
	
	try {
		// Get current usage
		const { data: currentUsage } = await admin
			.from('trial_usage')
			.select('linkedin_generated, x_generated')
			.eq('user_id', userId)
			.maybeSingle();
		
		if (!currentUsage) {
			console.warn(`[Trial Usage] No trial_usage row found for user ${userId}, skipping increment`);
			return;
		}
		
		// Increment
		const newLinkedIn = (currentUsage.linkedin_generated ?? 0) + (channels.linkedin ?? 0);
		const newX = (currentUsage.x_generated ?? 0) + (channels.x ?? 0);
		
		await admin
			.from('trial_usage')
			.update({
				linkedin_generated: newLinkedIn,
				x_generated: newX,
			})
			.eq('user_id', userId);
		
		console.log(`[Trial Usage] Incremented for user ${userId}:`, {
			linkedin: `${currentUsage.linkedin_generated} → ${newLinkedIn}`,
			x: `${currentUsage.x_generated} → ${newX}`,
		});
	} catch (error) {
		console.error(`[Trial Usage] Failed to increment for user ${userId}:`, error);
		// Don't throw - non-critical
	}
}
