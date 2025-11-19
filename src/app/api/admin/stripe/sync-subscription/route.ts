import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { PRICE_TO_PLAN } from '@/config/pricing';
import { upsertSubscriptionAndEntitlements } from '@/lib/billing';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { getSupabaseService } from '@/lib/supabaseService';

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
		const cookieStore = await cookies();
		const supabase = createServerClient(
			process.env.NEXT_PUBLIC_SUPABASE_URL!,
			process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
			{
				cookies: {
					get(name: string) {
						return cookieStore.get(name)?.value;
					},
					set(name: string, value: string, options: CookieOptions) {
						cookieStore.set({ name, value, ...options });
					},
					remove(name: string, options: CookieOptions) {
						cookieStore.set({ name, value: '', ...options });
					},
				},
			}
		);

		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!(await checkAdmin(user.id))) {
			return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
		}

		const { userId, subscriptionId } = await req.json();
		if (!userId || !subscriptionId) {
			return NextResponse.json({ error: 'Missing userId or subscriptionId' }, { status: 400 });
		}

		const stripe = getStripe();
		const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
		const priceId = subscription.items.data[0]?.price?.id;

		if (!priceId) {
			return NextResponse.json({ error: 'No price ID found in subscription' }, { status: 400 });
		}

		const mapping = PRICE_TO_PLAN[priceId];
		if (!mapping) {
			return NextResponse.json({ error: 'Unknown price ID' }, { status: 400 });
		}

		await upsertSubscriptionAndEntitlements({
			userId,
			plan: mapping.plan,
			cycle: mapping.cycle,
			stripeCustomerId: subscription.customer as string,
			stripeSubscriptionId: subscriptionId,
			priceId,
			currentPeriodEnd: subscription.current_period_end,
		});

		return NextResponse.json({ ok: true, message: 'Subscription synced successfully' });
	} catch (error: any) {
		console.error('Sync subscription error:', error);
		return NextResponse.json({ error: error?.message || 'Failed to sync subscription' }, { status: 500 });
	}
}

