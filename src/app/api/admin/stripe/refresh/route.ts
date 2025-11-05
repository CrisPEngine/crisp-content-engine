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

		// If userId provided, get customer ID from subscription
		let customerId = stripeCustomerId;
		if (!customerId && userId) {
			const { data: sub } = await admin
				.from('subscriptions')
				.select('stripe_customer_id')
				.eq('user_id', userId)
				.maybeSingle();
			customerId = sub?.stripe_customer_id;
		}

		if (!customerId) {
			return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
		}

		// Fetch customer and subscriptions from Stripe
		const customer = await stripe.customers.retrieve(customerId);
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

		// Get user ID from customer metadata or profile
		let targetUserId = userId;
		if (!targetUserId) {
			const { data: profile } = await admin
				.from('profiles')
				.select('id')
				.eq('email', (customer as any).email)
				.maybeSingle();
			targetUserId = profile?.id;
		}

		if (!targetUserId) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		// Update subscription and entitlements
		await upsertSubscriptionAndEntitlements({
			userId: targetUserId,
			plan: mapping.plan,
			cycle: mapping.cycle,
			stripeCustomerId: customerId,
			stripeSubscriptionId: subscription.id,
			priceId,
			currentPeriodEnd: subscription.current_period_end,
		});

		return NextResponse.json({ success: true, subscription: mapping });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message ?? 'Server error' }, { status: 500 });
	}
}

