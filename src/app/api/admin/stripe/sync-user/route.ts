import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { getStripe } from '@/lib/stripe';
import { upsertSubscriptionAndEntitlements } from '@/lib/billing';
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

		const { targetUserId } = await req.json();

		if (!targetUserId) {
			return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 });
		}

		const admin = getSupabaseService();
		const stripe = getStripe();

		// Get user's email
		const { data: profile, error: profileError } = await admin
			.from('profiles')
			.select('email')
			.eq('id', targetUserId)
			.single();

		if (profileError || !profile?.email) {
			return NextResponse.json({ 
				error: 'User profile not found or missing email',
				details: profileError?.message 
			}, { status: 404 });
		}

		// Search Stripe for customers with this email
		const customers = await stripe.customers.list({
			email: profile.email,
			limit: 10,
		});

		if (customers.data.length === 0) {
			return NextResponse.json({ 
				error: 'No Stripe customer found for this email',
				email: profile.email
			}, { status: 404 });
		}

		// Find the first customer with an active subscription
		let customerId: string | null = null;
		let subscription: any = null;

		for (const customer of customers.data) {
			if (customer.deleted) continue;
			
			const subscriptions = await stripe.subscriptions.list({
				customer: customer.id,
				limit: 10,
				status: 'all', // Check all statuses to see what's there
			});

			// Prefer active, but accept any subscription
			const activeSub = subscriptions.data.find(s => s.status === 'active');
			if (activeSub) {
				customerId = customer.id;
				subscription = activeSub;
				break;
			}
			
			// If no active, take the most recent one
			if (subscriptions.data.length > 0 && !subscription) {
				customerId = customer.id;
				subscription = subscriptions.data[0];
			}
		}

		if (!customerId || !subscription) {
			return NextResponse.json({ 
				error: 'No subscription found for this customer',
				customersFound: customers.data.length,
				customerIds: customers.data.map(c => c.id)
			}, { status: 404 });
		}

		const priceId = subscription.items.data[0]?.price?.id;

		if (!priceId) {
			return NextResponse.json({ error: 'No price ID found in subscription' }, { status: 400 });
		}

		const mapping = PRICE_TO_PLAN[priceId];
		if (!mapping) {
			return NextResponse.json({ 
				error: 'Unknown price ID',
				priceId,
				availablePlans: Object.keys(PRICE_TO_PLAN)
			}, { status: 400 });
		}

		// Create/update subscription and entitlements
		await upsertSubscriptionAndEntitlements({
			userId: targetUserId,
			plan: mapping.plan,
			cycle: mapping.cycle,
			stripeCustomerId: customerId,
			stripeSubscriptionId: subscription.id,
			priceId,
			currentPeriodEnd: subscription.current_period_end as number | undefined,
		});

		// Wait for DB write
		await new Promise(resolve => setTimeout(resolve, 500));

		// Verify it was created
		const { data: createdSubscription, error: verifyError } = await admin
			.from('subscriptions')
			.select('*')
			.eq('user_id', targetUserId)
			.single();

		if (verifyError) {
			return NextResponse.json({ 
				error: 'Subscription created but verification failed',
				details: verifyError.message,
				subscription: {
					user_id: targetUserId,
					plan: mapping.plan,
					cycle: mapping.cycle,
					status: 'active',
				}
			}, { status: 500 });
		}

		return NextResponse.json({ 
			success: true,
			subscription: createdSubscription,
			stripeSubscription: {
				id: subscription.id,
				status: subscription.status,
				priceId,
				customerId,
			}
		});
	} catch (e: any) {
		console.error('Sync user subscription error:', e);
		return NextResponse.json({ 
			error: e?.message ?? 'Server error',
			stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
		}, { status: 500 });
	}
}

