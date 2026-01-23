import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.redirect(new URL('/sign-in', process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'));
	}

	const url = new URL(request.url);
	const connectionType = url.searchParams.get('type') || 'personal'; // 'personal' or 'business'

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
	// Store connection type in cookie so callback knows which type to create
	cookieStore.set('linkedin_connection_type', connectionType, {
		httpOnly: true,
		secure: true,
		path: '/',
		maxAge: 600,
	});

	// LinkedIn OAuth scopes
	// Personal profile posting (existing functionality)
	// w_member_social - Post to personal profile
	// Organization posting (new - requires LinkedIn Advertising API access)
	// r_organization_social - Read posts, comments, reactions from organization pages
	// w_organization_social - Write/post content to organization pages
	// r_organization_admin - Read organizational data (list pages user administers)
	// w_organization_admin - Write organizational data (if needed)
	const scope = [
		'openid',
		'profile',
		'email',
		'w_member_social',           // Personal profile posting
		'r_organization_admin',      // Read organization admin data
		'r_organization_social',     // Read organization social posts
		'w_organization_social',     // Write organization social posts
	].join(' ');
	const authorizeUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
	authorizeUrl.searchParams.set('response_type', 'code');
	authorizeUrl.searchParams.set('client_id', clientId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('scope', scope);

	return NextResponse.redirect(authorizeUrl);
}
