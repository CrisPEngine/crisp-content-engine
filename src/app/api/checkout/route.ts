import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const { priceId, successUrl, cancelUrl } = await req.json();
        if (!priceId) return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });

        // Resolve authenticated user from cookies
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
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            // Redirect to login with return URL
            return NextResponse.json({ 
                error: 'Not authenticated',
                redirectTo: `/login?redirect=${encodeURIComponent('/billing')}`
            }, { status: 401 });
        }

        const stripe = getStripe();
        
        // Check if this is a Creator plan (monthly or annual) to add 14-day trial
        const creatorMonthlyPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_MONTHLY;
        const creatorAnnualPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CREATOR_ANNUAL;
        const isCreatorPlan = priceId === creatorMonthlyPriceId || priceId === creatorAnnualPriceId;
        
        const sessionConfig: any = {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/dashboard?sub=success`,
            cancel_url: cancelUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/billing?canceled=1`,
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
            client_reference_id: user.id,
            subscription_data: { 
                metadata: { user_id: user.id },
            },
            customer_creation: 'always', // Ensure customer is created
            metadata: { user_id: user.id },
        };
        
        // Add 14-day trial for Creator plan
        if (isCreatorPlan) {
            sessionConfig.subscription_data.trial_period_days = 14;
            console.log(`[Checkout] Adding 14-day trial for Creator plan (priceId: ${priceId})`);
        }
        
        const session = await stripe.checkout.sessions.create(sessionConfig);
        return NextResponse.json({ url: session.url });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? 'Checkout failed' }, { status: 400 });
    }
}


