import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(request: Request) {
	const url = new URL(request.url);
	const requestUrl = new URL(request.url);
	const code = requestUrl.searchParams.get('code');
	const type = requestUrl.searchParams.get('type');
	const token = requestUrl.searchParams.get('token');
	const tokenHash = requestUrl.searchParams.get('token_hash');
	
	// Handle error parameters (e.g., expired tokens)
	const error = requestUrl.searchParams.get('error');
	const errorDescription = requestUrl.searchParams.get('error_description');
	if (error) {
		console.error('Auth callback error:', { error, errorDescription, url: requestUrl.toString() });
		// Redirect to login with error message
		const loginUrl = new URL('/login', url.origin);
		loginUrl.searchParams.set('error', error);
		if (errorDescription) {
			loginUrl.searchParams.set('error_description', errorDescription);
		}
		return NextResponse.redirect(loginUrl);
	}
	
	// Handle password reset or invite flow - redirect to login with token so Auth UI can handle it
	// Both 'recovery' (password reset) and 'invite' (new user invite) should go to login
	if ((type === 'recovery' || type === 'invite') && (token || tokenHash)) {
		// Build the redirect URL with all the necessary parameters
		const loginUrl = new URL('/login', url.origin);
		loginUrl.searchParams.set('type', type);
		if (token) loginUrl.searchParams.set('token', token);
		if (tokenHash) loginUrl.searchParams.set('token_hash', tokenHash);
		// Preserve any other query params that might be needed
		requestUrl.searchParams.forEach((value, key) => {
			if (key !== 'type' && key !== 'token' && key !== 'token_hash') {
				loginUrl.searchParams.set(key, value);
			}
		});
		return NextResponse.redirect(loginUrl);
	}
	
	// If code is present, exchange it for a session (OAuth flow)
	if (code) {
		const supabase = await createClient();
		// Exchange code for session - this will set cookies automatically
		const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
		
		if (exchangeError) {
			console.error('Error exchanging code for session:', exchangeError);
			// Redirect to login with error
			return NextResponse.redirect(new URL('/login?error=oauth_error', url.origin));
		}
	}
	
	const supabase = await createClient();
	const { data: { user }, error: userError } = await supabase.auth.getUser();
	
	if (userError) {
		console.error('Error getting user:', userError);
		return NextResponse.redirect(new URL('/login?error=auth_error', url.origin));
	}
	
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
		
		// Always redirect to dashboard - dashboard will handle showing "Select Your Plan" for users without subscription
		// This ensures:
		// - New users see the dashboard with onboarding/payment options
		// - Returning users without subscription see dashboard with "Select Your Plan" button
		// - Users with subscription see their normal dashboard
		const next = url.searchParams.get('next');
		const redirectPath = next || '/dashboard';
		return NextResponse.redirect(new URL(redirectPath, url.origin));
	}
	
	// If no user, redirect to login
	return NextResponse.redirect(new URL('/login', url.origin));
}


