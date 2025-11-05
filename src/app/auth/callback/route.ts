import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const supabase = createClient();
	const { data: { user } } = await supabase.auth.getUser();
	
	if (user) {
		// Ensure profile exists on first login
		const admin = supabaseAdmin();
		const { data: existing } = await admin
			.from('profiles')
			.select('*')
			.eq('user_id', user.id)
			.maybeSingle();
		
		if (!existing) {
			await admin.from('profiles').insert({
				user_id: user.id,
				email: user.email,
				full_name: user.user_metadata?.full_name || null,
			});
		}
		
		// Check if user has entitlements (subscription)
		const { data: sub } = await admin
			.from('subscriptions')
			.select('plan')
			.eq('user_id', user.id)
			.maybeSingle();
		
		// If no subscription, redirect to onboarding/billing
		if (!sub) {
			const next = url.searchParams.get('next');
			if (next?.startsWith('/app')) {
				return NextResponse.redirect(new URL('/onboarding', url.origin));
			}
			return NextResponse.redirect(new URL('/onboarding', url.origin));
		}
	}
	
	const next = url.searchParams.get('next') ?? '/app';
	return NextResponse.redirect(new URL(next, url.origin));
}


