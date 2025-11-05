import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-10-29.clover' });

export async function POST(req: Request) {
    try {
        const { priceId, successUrl, cancelUrl } = await req.json();
        if (!priceId) return NextResponse.json({ error: 'Missing priceId' }, { status: 400 });

        // Resolve authenticated user from cookies
        const res = NextResponse.next();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return (req as any).cookies?.get?.(name)?.value; },
                    set(name: string, value: string, options: CookieOptions) { res.cookies.set({ name, value, ...options }); },
                    remove(name: string, options: CookieOptions) { res.cookies.set({ name, value: '', ...options, expires: new Date(0) }); },
                },
            }
        );
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard?sub=success`,
            cancel_url: cancelUrl ?? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing?canceled=1`,
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
            client_reference_id: user.id,
            subscription_data: { metadata: { user_id: user.id } },
            metadata: { user_id: user.id },
        });
        return NextResponse.json({ url: session.url }, { headers: res.headers });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? 'Checkout failed' }, { status: 400 });
    }
}


