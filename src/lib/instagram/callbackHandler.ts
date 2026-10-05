import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { oauthRedirectBase, readAndClearOAuthStateCookie } from '@/lib/social/oauthState';
import {
	exchangeInstagramCode,
	exchangeInstagramLongLived,
	fetchInstagramProfessionalProfile,
	instagramRedirectUri,
} from '@/lib/instagram/oauth';
import { persistOAuthAuthorization } from '@/lib/social/upsertNative';
import { SOCIAL_PROVIDERS, DESTINATION_TYPES } from '@/lib/social/providers';

export type InstagramCallbackVariant = 'connections' | 'meta';

export async function handleInstagramOAuthCallback(request: Request, variant: InstagramCallbackVariant) {
	const base = oauthRedirectBase();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const redirectUri = instagramRedirectUri(variant);

	if (error) {
		return NextResponse.redirect(`${base}/connections?error=instagram_auth_failed&details=${encodeURIComponent(error)}`);
	}
	if (!code || !state) {
		return NextResponse.redirect(`${base}/connections?error=invalid_response`);
	}

	const stored = await readAndClearOAuthStateCookie('instagram_oauth_state');
	if (!stored || stored.state !== state) {
		return NextResponse.redirect(`${base}/connections?error=state_mismatch`);
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user || stored.payload.userId !== user.id) {
		return NextResponse.redirect(`${base}/sign-in?redirect_to=/connections`);
	}

	try {
		const short = await exchangeInstagramCode(code, redirectUri);
		const long = await exchangeInstagramLongLived(short.access_token);
		const profile = await fetchInstagramProfessionalProfile(long.access_token);
		const igUserId = profile.id || short.user_id;
		const username = profile.username || '';
		const expiresAt = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();

		await persistOAuthAuthorization({
			ownerUserId: user.id,
			provider: SOCIAL_PROVIDERS.INSTAGRAM,
			providerAccountId: String(igUserId),
			scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
			expiresAt,
			accessToken: long.access_token,
			destination: {
				destinationType: DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL,
				providerDestinationId: String(igUserId),
				displayName: username ? `@${username.replace(/^@/, '')}` : 'Instagram',
				handle: username,
			},
			brandId: stored.payload.brandId || null,
			channel: 'instagram',
		});

		const brandQuery = stored.payload.brandId ? `&brand_id=${encodeURIComponent(stored.payload.brandId)}` : '';
		return NextResponse.redirect(`${base}/connections?connected=instagram${brandQuery}`);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message.slice(0, 120) : 'instagram_auth_failed';
		return NextResponse.redirect(`${base}/connections?error=instagram_auth_failed&details=${encodeURIComponent(message)}`);
	}
}
