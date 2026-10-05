import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/auth/safeRedirect';

export const runtime = 'nodejs';

/**
 * Server-side Supabase auth callback.
 * Establishes session cookies before redirect so protected routes never flash sign-in.
 */
export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');
	const type = url.searchParams.get('type');
	const tokenHash = url.searchParams.get('token_hash');
	const token = url.searchParams.get('token');
	const redirectTo = safeRedirectPath(url.searchParams.get('redirect_to'));

	const origin = process.env.NEXT_PUBLIC_SITE_URL || url.origin;

	if (error) {
		const params = new URLSearchParams({ error });
		if (errorDescription) params.set('error_description', errorDescription);
		params.set('redirect_to', redirectTo);
		return NextResponse.redirect(`${origin}/sign-in?${params.toString()}`);
	}

	if (type === 'recovery' && (tokenHash || token)) {
		const params = new URLSearchParams({ type: 'recovery' });
		if (tokenHash) params.set('token_hash', tokenHash);
		if (token) params.set('token', token);
		if (redirectTo !== '/dashboard') params.set('redirect_to', redirectTo);
		return NextResponse.redirect(`${origin}/sign-in?${params.toString()}`);
	}

	if (code) {
		const supabase = await createClient();
		const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
		if (exchangeError) {
			console.error('[auth/callback] exchangeCodeForSession failed:', exchangeError.message);
			return NextResponse.redirect(
				`${origin}/sign-in?error=oauth_error&redirect_to=${encodeURIComponent(redirectTo)}`
			);
		}
		return NextResponse.redirect(`${origin}${redirectTo}`);
	}

	return NextResponse.redirect(`${origin}/sign-in?error=invalid_callback`);
}
