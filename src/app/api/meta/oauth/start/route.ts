/**
 * Meta OAuth Start
 * 
 * Initiates OAuth flow for Meta (Facebook + Instagram) connection.
 * Feature-flagged: requires META_PUBLISHING_ENABLED=true
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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
	const redirectUri = process.env.META_REDIRECT_URI || 
		`${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io'}/api/meta/oauth/callback`;

	if (!appId) {
		return NextResponse.json(
			{ error: 'Meta app credentials not configured' },
			{ status: 500 }
		);
	}

	// Generate and store OAuth state
	const state = randomBytes(32).toString('hex');
	const cookieStore = await cookies();
	cookieStore.set('meta_oauth_state', state, {
		httpOnly: true,
		secure: true,
		path: '/',
		maxAge: 600, // 10 minutes
	});

	// Meta OAuth scopes
	// Pages: list, read engagement, manage posts
	// Instagram: basic info, content publishing
	const scope = [
		'pages_show_list',
		'pages_read_engagement',
		'pages_manage_posts',
		'instagram_basic',
		'instagram_content_publish',
	].join(',');

	// Build Meta OAuth URL
	const authorizeUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth');
	authorizeUrl.searchParams.set('client_id', appId);
	authorizeUrl.searchParams.set('redirect_uri', redirectUri);
	authorizeUrl.searchParams.set('state', state);
	authorizeUrl.searchParams.set('scope', scope);
	authorizeUrl.searchParams.set('response_type', 'code');

	return NextResponse.redirect(authorizeUrl);
}
