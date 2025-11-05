import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export const runtime = 'nodejs';

export async function POST(req: Request) {
	// Resolve user
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

	// Look up customer id from subscriptions
	const { data: sub } = await supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();
	const customerId = (sub as any)?.stripe_customer_id;
	if (!customerId) return NextResponse.json({ error: 'No Stripe customer' }, { status: 404 });

	const stripe = getStripe();
	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/billing`,
	});
	return NextResponse.json({ url: session.url });
}


