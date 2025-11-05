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
		
		// Determine redirect destination based on subscription status
		const next = url.searchParams.get('next');
		if (!sub) {
			// If no subscription, redirect to billing to select a plan
			return NextResponse.redirect(new URL('/billing', url.origin));
		}
		
		// If subscription exists, redirect to dashboard or requested path
		const redirectPath = next || '/dashboard';
		return NextResponse.redirect(new URL(redirectPath, url.origin));
	}
	
	// If no user, redirect to login
	return NextResponse.redirect(new URL('/login', url.origin));
}


