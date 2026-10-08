import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { oauthRedirectBase, readAndClearOAuthStateCookie } from '@/lib/social/oauthState';
import { exchangeThreadsCode, exchangeThreadsLongLived, fetchThreadsProfile } from '@/lib/threads/oauth';
import { THREADS_OAUTH_SCOPES } from '@/lib/threads/scopes';
import { persistOAuthAuthorization } from '@/lib/social/upsertNative';
import { SOCIAL_PROVIDERS, DESTINATION_TYPES } from '@/lib/social/providers';
import { formatInstagramHandle } from '@/lib/social/brandBrainName';
import { getSupabaseService } from '@/lib/supabaseService';

export async function handleThreadsOAuthCallback(request: Request) {
	const base = oauthRedirectBase();
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	if (error) {
		const detail = errorDescription || error;
		return NextResponse.redirect(`${base}/connections?error=threads_auth_failed&details=${encodeURIComponent(detail)}`);
	}
	if (!code || !state) {
		return NextResponse.redirect(`${base}/connections?error=invalid_response`);
	}

	const stored = await readAndClearOAuthStateCookie('threads_oauth_state');
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
		const short = await exchangeThreadsCode(code);
		const long = await exchangeThreadsLongLived(short.access_token);
		const profile = await fetchThreadsProfile(long.access_token);
		const threadsUserId = profile.id || String(short.user_id);
		const username = (profile.username || '').replace(/^@/, '');
		const handleLabel = formatInstagramHandle(username, null);
		const expiresAt = new Date(Date.now() + (long.expires_in || 5184000) * 1000).toISOString();

		const brandId = stored.payload.brandId || '';
		let assigned = false;

		const { destinationId } = await persistOAuthAuthorization({
			ownerUserId: user.id,
			provider: SOCIAL_PROVIDERS.THREADS,
			providerAccountId: String(threadsUserId),
			scopes: [...THREADS_OAUTH_SCOPES],
			expiresAt,
			accessToken: long.access_token,
			destination: {
				destinationType: DESTINATION_TYPES.THREADS_PROFILE,
				providerDestinationId: String(threadsUserId),
				displayName: handleLabel,
				handle: username,
			},
			brandId: brandId || null,
			channel: brandId ? 'threads' : null,
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
			connected: 'threads',
			account: username || handleLabel.replace(/^@/, ''),
			destination_id: destinationId,
			assigned: assigned ? '1' : '0',
		});
		if (brandId) params.set('brand', brandId);

		return NextResponse.redirect(`${base}/connections?${params.toString()}`);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message.slice(0, 120) : 'threads_auth_failed';
		return NextResponse.redirect(`${base}/connections?error=threads_auth_failed&details=${encodeURIComponent(message)}`);
	}
}
