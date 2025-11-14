import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'));
	}

	const clientId = process.env.LINKEDIN_CLIENT_ID;
	const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'}/api/connections/linkedin/callback`;

	if (!clientId) {
		return NextResponse.json({ error: 'LinkedIn client ID not configured' }, { status: 500 });
	}

	const state = randomBytes(16).toString('hex');
	const cookieStore = await cookies();
	cookieStore.set('linkedin_oauth_state', state, {
		httpOnly: true,
		secure: true,
		path: '/',
		maxAge: 600,
	});

	// LinkedIn Marketing Developer Platform scopes
	// r_liteprofile is deprecated - removed
	// w_member_social requires Marketing Developer Platform product to be enabled
	const scope = ['w_member_social', 'openid', 'profile', 'email'].join(' ');
	const authorizeUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
	authorizeUrl.searchParams.set('response_type', 'code');
	authorizeUrl.searchParams.set('client_id', clientId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('scope', scope);

	return NextResponse.redirect(authorizeUrl);
}
