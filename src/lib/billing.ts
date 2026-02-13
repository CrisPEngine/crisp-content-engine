import type Stripe from 'stripe';
import { CAPS, PRICE_TO_PLAN } from '@/config/pricing';
import { getSupabaseService } from './supabaseService';

export const supabaseAdmin = getSupabaseService;

export async function upsertUserFromStripe(stripeCustomerId: string | null | undefined, email?: string | null) {
	if (!email) return null;
	const admin = supabaseAdmin();
	// First try to find by email
	const { data: profile } = await admin
		.from('profiles')
		.select('*')
		.eq('email', email)
		.maybeSingle();
	if (profile) return profile;
	// If not found, we can't create a profile without a user_id (auth.users.id)
	// This should only happen if the user hasn't logged in yet
	// The webhook will use metadata.user_id or client_reference_id instead
	return null;
}

export function capsFor(plan: 'trial' | 'starter' | 'creator' | 'growth' | 'pro' | 'scale') {
	const c = CAPS[plan];
	return {
		max_brands: c.maxBrands,
		max_channels: c.maxChannels,
		posts_per_month: c.postsPerMonth === 'unlimited' ? 999999 : c.postsPerMonth,
		image_gen: c.includedImageGen,
	};
}

export function extractCustomerAndEmail(obj: any): { customerId?: string; customerEmail?: string } {
	const customerId =
		('customer' in obj && obj.customer) ? (typeof obj.customer === 'string' ? obj.customer : obj.customer?.id) : undefined;
	const customerEmail =
		('customer_details' in obj && obj.customer_details?.email) ? obj.customer_details.email :
		('customer_email' in obj ? obj.customer_email : undefined);
	return { customerId, customerEmail };
}

export function resolvePlanFromPriceId(priceId?: string) {
	if (!priceId) return undefined;
	return PRICE_TO_PLAN[priceId];
}

export async function upsertSubscriptionAndEntitlements(params: {
	userId: string;
	plan: 'trial' | 'starter' | 'creator' | 'growth' | 'pro' | 'scale';
	cycle: 'monthly' | 'annual';
	stripeCustomerId?: string;
	stripeSubscriptionId?: string | null;
	priceId?: string;
	currentPeriodEnd?: number | null | undefined; // seconds since epoch
	trialStartAt?: string | null; // ISO timestamp for trial start
	trialEndAt?: string | null; // ISO timestamp for trial end
}) {
	const admin = supabaseAdmin();
	const caps = capsFor(params.plan);
	const currentPeriodEndIso = params.currentPeriodEnd ? new Date(params.currentPeriodEnd * 1000).toISOString() : null;

	try {
		const subscriptionData: any = {
			user_id: params.userId,
			plan: params.plan,
			cycle: params.cycle,
		};

		// Only include optional columns if they exist in schema and are provided
		// Based on actual usage in codebase, these columns exist:
		if (params.stripeCustomerId) {
			subscriptionData.stripe_customer_id = params.stripeCustomerId;
		}
		if (params.stripeSubscriptionId) {
			subscriptionData.stripe_subscription_id = params.stripeSubscriptionId;
		}
		if (currentPeriodEndIso) {
			subscriptionData.current_period_end = currentPeriodEndIso;
		}
		if (params.trialStartAt) {
			subscriptionData.trial_start_at = params.trialStartAt;
		}
		if (params.trialEndAt) {
			subscriptionData.trial_end_at = params.trialEndAt;
		}
		
		// Note: The following columns don't exist in schema:
		// - provider (removed)
		// - metadata (removed)
		// - status (may not exist, removed)
		// - updated_at (may not exist, removed)

		const { error: subError } = await admin.from('subscriptions').upsert(subscriptionData);
		
		if (subError) {
			console.error('Error upserting subscription:', subError);
			throw new Error(`Failed to create subscription: ${subError.message}`);
		}
	} catch (err: any) {
		console.error('upsertSubscriptionAndEntitlements error:', err);
		throw err;
	}

	await admin.from('entitlements').upsert({
		user_id: params.userId,
		...caps,
		updated_at: new Date().toISOString(),
	});
}


