import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	
	if (user) {
		// Ensure profile exists on first login
		const admin = supabaseAdmin();
		const { data: existing } = await admin
			.from('profiles')
			.select('*')
			.eq('id', user.id)
			.maybeSingle();
		
		if (!existing) {
			// Set is_admin for super admin account
			const isAdmin = user.id === '959656d4-b1c2-4d21-bd46-f89f3f41bb0f';
			await admin.from('profiles').insert({
				id: user.id,
				email: user.email,
				full_name: user.user_metadata?.full_name || null,
				is_admin: isAdmin,
			});
		} else if (!existing.is_admin && user.id === '959656d4-b1c2-4d21-bd46-f89f3f41bb0f') {
			// Update existing profile to admin if super admin
			await admin.from('profiles').update({ is_admin: true }).eq('id', user.id);
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
			if (next?.startsWith('/dashboard') || next?.startsWith('/app')) {
				return NextResponse.redirect(new URL('/onboarding', url.origin));
			}
			return NextResponse.redirect(new URL('/onboarding', url.origin));
		}
	}
	
	// Determine redirect destination
	let redirectPath = '/dashboard';
	if (!sub) {
		redirectPath = '/billing'; // Redirect to billing if no subscription
	}
	
	const next = url.searchParams.get('next') || redirectPath;
	// Use url.origin to ensure we stay on the same domain (production or localhost)
	return NextResponse.redirect(new URL(next, url.origin));
}


