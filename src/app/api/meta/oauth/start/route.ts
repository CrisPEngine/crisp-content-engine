/**
 * Meta OAuth Start
 * 
 * Initiates OAuth flow for Meta (Facebook + Instagram) connection.
 * Feature-flagged: requires META_PUBLISHING_ENABLED=true
 */

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	// Feature flag check
	if (!isMetaPublishingEnabled()) {
		return NextResponse.json(
			{ error: 'Meta publishing is not enabled' },
			{ status: 404 }
		);
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
		return NextResponse.redirect(new URL('/sign-in', redirectBase));
	}

	const appId = process.env.META_APP_ID;
	// CRISP publishing callback only (do not use Supabase callback here)
	const redirectUri =
		process.env.META_REDIRECT_URI ||
		`${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'}/api/meta/oauth/callback`;

	if (!appId) {
		return NextResponse.json(
			{ error: 'Meta app credentials not configured' },
			{ status: 500 }
		);
	}

	// Generate OAuth state token
	const state = randomBytes(32).toString('hex');

	// Meta OAuth scopes
	// Business Management: required to list Business Manager pages via /me/businesses
	// Pages: list, read engagement, manage posts
	// Instagram: basic info, content publishing, comments, DM management
	// Note: when config_id is set, Meta uses the LFB config permissions instead of this scope.
	//       Keep this list in sync with your Facebook Login for Business configuration.
	const scope = [
		'business_management',
		'pages_show_list',
		'pages_read_engagement',
		'pages_manage_posts',
		'instagram_basic',
		'instagram_content_publish',
		'instagram_business_basic',
		'instagram_manage_comments',
		'instagram_business_manage_messages',
	].join(',');

	// Build Meta OAuth URL (publishing connect flow)
	const authorizeUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth');
	authorizeUrl.searchParams.set('client_id', appId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('scope', scope);
	authorizeUrl.searchParams.set('response_type', 'code');

	// Facebook Login for Business: use config_id so Meta uses the app's LFB configuration (supported permissions)
	const lfbConfigId = process.env.META_LFB_CONFIG_ID;
	if (lfbConfigId) {
		authorizeUrl.searchParams.set('config_id', lfbConfigId);
	}

	// Set state cookie directly on the redirect response to ensure Set-Cookie header is included.
	// sameSite: 'lax' is required so the browser sends the cookie back after the cross-site
	// redirect from facebook.com → app.crispdigital.io/api/meta/oauth/callback.
	const response = NextResponse.redirect(authorizeUrl);
	response.cookies.set('meta_oauth_state', state, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 600, // 10 minutes
	});

	return response;
}
