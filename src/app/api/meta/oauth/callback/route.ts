/**
 * Meta OAuth Callback
 * 
 * Handles OAuth callback from Meta, exchanges code for tokens,
 * fetches Pages and Instagram accounts, and stores encrypted tokens.
 * Feature-flagged: requires META_PUBLISHING_ENABLED=true
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import {
	exchangeCodeForToken,
	exchangeForLongLivedToken,
	getUserInfo,
	getUserPages,
	getPageInstagramAccount,
	encryptMetaToken,
} from '@/lib/meta/graph';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	// Feature flag check
	if (!isMetaPublishingEnabled()) {
		return NextResponse.json(
			{ error: 'Meta publishing is not enabled' },
			{ status: 404 }
		);
	}

	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
	const redirectUri = process.env.META_REDIRECT_URI || 
		`${redirectBase}/api/meta/oauth/callback`;

	// Handle OAuth error
	if (error) {
		console.error('[Meta OAuth] Error from Meta:', error, errorDescription);
		return NextResponse.redirect(
			`${redirectBase}/connections?error=meta_auth_failed&details=${encodeURIComponent(errorDescription || error)}`
		);
	}

	if (!code || !state) {
		return NextResponse.redirect(
			`${redirectBase}/connections?error=invalid_response`
		);
	}

	// Validate state
	const cookieStore = await cookies();
	const storedState = cookieStore.get('meta_oauth_state')?.value;
	cookieStore.set('meta_oauth_state', '', { path: '/', maxAge: 0 });

	if (!storedState || storedState !== state) {
		return NextResponse.redirect(
			`${redirectBase}/connections?error=state_mismatch`
		);
	}

	// Ensure user is authenticated
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.redirect(`${redirectBase}/sign-in`);
	}

	try {
		// Step 1: Exchange code for short-lived token
		const tokenResponse = await exchangeCodeForToken(code, redirectUri);
		const shortLivedToken = tokenResponse.access_token;

		// Step 2: Exchange for long-lived token (60 days)
		const longLivedResponse = await exchangeForLongLivedToken(shortLivedToken);
		const accessToken = longLivedResponse.access_token;
		const expiresIn = longLivedResponse.expires_in;
		const expiresAt = new Date(Date.now() + expiresIn * 1000);

		// Step 3: Get user info
		const userInfo = await getUserInfo(accessToken);
		const facebookUserId = userInfo.id;

		// Step 4: Get user's Pages (with Page access tokens)
		const pages = await getUserPages(accessToken);

		if (pages.length === 0) {
			return NextResponse.redirect(
				`${redirectBase}/connections?error=no_pages&details=${encodeURIComponent('No Facebook Pages found. You must have access to at least one Facebook Page to publish.')}`
			);
		}

		// Step 5: Store connection and pages in Supabase
		const admin = getSupabaseService();

		// Upsert meta_connections
		const { data: connection, error: connError } = await admin
			.from('meta_connections')
			.upsert(
				{
					user_id: user.id,
					facebook_user_id: facebookUserId,
					access_token_encrypted: encryptMetaToken(accessToken),
					token_expires_at: expiresAt.toISOString(),
					scopes_granted: {
						scopes: [
							'pages_show_list',
							'pages_read_engagement',
							'pages_manage_posts',
							'instagram_basic',
							'instagram_content_publish',
						],
					},
					updated_at: new Date().toISOString(),
				},
				{
					onConflict: 'user_id',
				}
			)
			.select('id')
			.single();

		if (connError) {
			console.error('[Meta OAuth] Failed to save connection:', connError);
			throw new Error(`Failed to save connection: ${connError.message}`);
		}

		// Step 6: Clear stale data, then store fresh pages and Instagram accounts
		// On reconnect, user may have lost access to pages or gained new ones.
		// Delete everything and re-insert from the current Graph API response.
		await admin
			.from('meta_instagram_accounts')
			.delete()
			.eq('user_id', user.id);

		await admin
			.from('meta_pages')
			.delete()
			.eq('user_id', user.id);

		for (const page of pages) {
			const pageData: any = {
				user_id: user.id,
				page_id: page.id,
				page_name: page.name,
			};

			// Only store token if present
			if (page.access_token) {
				pageData.page_access_token_encrypted = encryptMetaToken(page.access_token);
			}

			await admin
				.from('meta_pages')
				.insert(pageData)
				.select('id, page_id')
				.single();

			// Only fetch Instagram if we have a valid page token
			if (!page.access_token) {
				console.warn(`[Meta OAuth] Skipping IG discovery for page ${page.id}: no access token`);
				continue;
			}

			try {
				const igAccount = await getPageInstagramAccount(page.id, page.access_token);
				
				if (igAccount) {
					await admin.from('meta_instagram_accounts').insert({
						user_id: user.id,
						ig_user_id: igAccount.id,
						ig_username: igAccount.username,
						connected_page_id: page.id,
					});
				}
			} catch (igError) {
				console.warn(`[Meta OAuth] Failed to fetch IG for page ${page.id}:`, igError);
				// Continue even if IG fetch fails for this page
			}
		}

		// Step 7: Redirect to selection page so user can choose which Page and Instagram to use
		// (No auto-select; user must select on /connections/meta/select)
		return NextResponse.redirect(
			`${redirectBase}/connections/meta/select`
		);
	} catch (err: any) {
		console.error('[Meta OAuth] Callback error:', err);
		const errorMsg = err?.message ? encodeURIComponent(err.message.substring(0, 100)) : 'meta_auth_failed';
		return NextResponse.redirect(
			`${redirectBase}/connections?error=meta_auth_failed&details=${errorMsg}`
		);
	}
}
