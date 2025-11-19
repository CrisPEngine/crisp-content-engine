import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { getStripe } from '@/lib/stripe';
import { upsertSubscriptionAndEntitlements, extractCustomerAndEmail } from '@/lib/billing';
import { PRICE_TO_PLAN } from '@/config/pricing';

export const runtime = 'nodejs';

async function checkAdmin(userId: string) {
	const admin = getSupabaseService();
	const { data: profile } = await admin
		.from('profiles')
		.select('is_admin')
		.eq('id', userId)
		.single();
	return profile?.is_admin === true;
}

export async function POST(req: Request) {
	try {
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		
		if (!user) {
			return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
		}

		const isAdmin = await checkAdmin(user.id);
		if (!isAdmin) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const { userId, stripeCustomerId } = await req.json();

		if (!userId && !stripeCustomerId) {
			return NextResponse.json({ error: 'Missing userId or stripeCustomerId' }, { status: 400 });
		}

		const admin = getSupabaseService();
		const stripe = getStripe();

		// If userId provided, get customer ID from subscription OR search by email
		let customerId = stripeCustomerId;
		let targetUserId = userId;
		
		if (!customerId && userId) {
			// First, try to get from existing subscription
			const { data: sub } = await admin
				.from('subscriptions')
				.select('stripe_customer_id')
				.eq('user_id', userId)
				.maybeSingle();
			customerId = sub?.stripe_customer_id;

			// If no subscription record exists, search Stripe by user email
			if (!customerId) {
				const { data: profile } = await admin
					.from('profiles')
					.select('email')
					.eq('id', userId)
					.single();

				if (profile?.email) {
					// Search Stripe for customers with this email
					const customers = await stripe.customers.list({
						email: profile.email,
						limit: 10,
					});

					// Find the first customer with an active subscription
					for (const customer of customers.data) {
						if (customer.deleted) continue;
						
						const subscriptions = await stripe.subscriptions.list({
							customer: customer.id,
							limit: 1,
							status: 'active',
						});

						if (subscriptions.data.length > 0) {
							customerId = customer.id;
							break;
						}
					}
				}
			}
		}

		if (!customerId) {
			return NextResponse.json({ 
				error: 'No Stripe customer found. Make sure the user has completed checkout in Stripe.' 
			}, { status: 404 });
		}

		// Fetch customer and subscriptions from Stripe
		const customer = await stripe.customers.retrieve(customerId) as any;
		if (customer.deleted) {
			return NextResponse.json({ error: 'Customer deleted' }, { status: 404 });
		}

		const subscriptions = await stripe.subscriptions.list({
			customer: customerId,
			limit: 1,
			status: 'active',
		});

		if (subscriptions.data.length === 0) {
			return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
		}

		const subscription = subscriptions.data[0];
		const priceId = subscription.items.data[0]?.price?.id;

		if (!priceId) {
			return NextResponse.json({ error: 'No price ID found' }, { status: 400 });
		}

		const mapping = PRICE_TO_PLAN[priceId];
		if (!mapping) {
			return NextResponse.json({ error: 'Unknown price ID' }, { status: 400 });
		}

		// Get user ID - use provided userId, or look up by customer email
		if (!targetUserId) {
			const customerEmail = (customer as any).email;
			if (customerEmail) {
				const { data: profile } = await admin
					.from('profiles')
					.select('id')
					.eq('email', customerEmail)
					.maybeSingle();
				targetUserId = profile?.id;
			}
		}

		if (!targetUserId) {
			return NextResponse.json({ 
				error: 'User not found. Make sure the customer email in Stripe matches a user email in the system.' 
			}, { status: 404 });
		}

		// Update subscription and entitlements
		await upsertSubscriptionAndEntitlements({
			userId: targetUserId,
			plan: mapping.plan,
			cycle: mapping.cycle,
			stripeCustomerId: customerId,
			stripeSubscriptionId: subscription.id,
			priceId,
			currentPeriodEnd: (subscription as any).current_period_end,
		});

		// Fetch the created subscription to return full details
		const { data: createdSubscription } = await admin
			.from('subscriptions')
			.select('*')
			.eq('user_id', targetUserId)
			.single();

		return NextResponse.json({ 
			success: true, 
			subscription: createdSubscription || {
				plan: mapping.plan,
				cycle: mapping.cycle,
				status: 'active',
				stripe_customer_id: customerId,
				stripe_subscription_id: subscription.id,
			}
		});
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

