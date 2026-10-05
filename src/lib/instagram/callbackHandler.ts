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
import { formatInstagramHandle } from '@/lib/social/brandBrainName';
import { getSupabaseService } from '@/lib/supabaseService';

export type InstagramCallbackVariant = 'connections' | 'meta';

export async function handleInstagramOAuthCallback(request: Request, variant: InstagramCallbackVariant) {
	const base = oauthRedirectBase();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');
	const redirectUri = instagramRedirectUri(variant);

	if (error) {
		const detail = errorDescription || error;
		return NextResponse.redirect(`${base}/connections?error=instagram_auth_failed&details=${encodeURIComponent(detail)}`);
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
		const handleLabel = formatInstagramHandle(username, null);
		const expiresAt = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();

		const brandId = stored.payload.brandId || '';
		let assigned = false;

		const { destinationId } = await persistOAuthAuthorization({
			ownerUserId: user.id,
			provider: SOCIAL_PROVIDERS.INSTAGRAM,
			providerAccountId: String(igUserId),
			scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
			expiresAt,
			accessToken: long.access_token,
			destination: {
				destinationType: DESTINATION_TYPES.INSTAGRAM_PROFESSIONAL,
				providerDestinationId: String(igUserId),
				displayName: handleLabel,
				handle: username.replace(/^@/, ''),
			},
			brandId: brandId || null,
			channel: brandId ? 'instagram' : null,
		});

		if (brandId) {
			const admin = getSupabaseService();
			const { data: brand } = await admin.from('brand_brains').select('id').eq('id', brandId).eq('user_id', user.id).maybeSingle();
			if (brand) {
				const { data: link } = await admin
					.from('brand_destinations')
					.select('brand_id')
					.eq('brand_id', brandId)
					.eq('destination_id', destinationId)
					.maybeSingle();
				assigned = Boolean(link);
			}
		}

		const params = new URLSearchParams({
			connected: 'instagram',
			account: username.replace(/^@/, '') || handleLabel.replace(/^@/, ''),
			destination_id: destinationId,
			assigned: assigned ? '1' : '0',
		});
		if (brandId) params.set('brand', brandId);

		return NextResponse.redirect(`${base}/connections?${params.toString()}`);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message.slice(0, 120) : 'instagram_auth_failed';
		return NextResponse.redirect(`${base}/connections?error=instagram_auth_failed&details=${encodeURIComponent(message)}`);
	}
}
