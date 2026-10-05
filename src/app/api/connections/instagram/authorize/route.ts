import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createOAuthState, oauthRedirectBase, setOAuthStateCookie } from '@/lib/social/oauthState';
import { instagramAuthorizeUrl } from '@/lib/instagram/oauth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	const base = oauthRedirectBase();
	if (!user) {
		return NextResponse.redirect(`${base}/sign-in?redirect_to=${encodeURIComponent('/connections')}`);
	}

	const url = new URL(request.url);
	const brandId = url.searchParams.get('brand_id') || '';

	try {
		const state = createOAuthState();
		await setOAuthStateCookie('instagram_oauth_state', state, { brandId, userId: user.id });
		return NextResponse.redirect(instagramAuthorizeUrl(state));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Instagram OAuth not configured';
		return NextResponse.redirect(`${base}/connections?error=instagram_not_configured&details=${encodeURIComponent(message)}`);
	}
}
