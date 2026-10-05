import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createOAuthState, oauthRedirectBase, setOAuthStateCookie } from '@/lib/social/oauthState';
import { threadsAuthorizeUrl } from '@/lib/threads/oauth';

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
	const addAccount = url.searchParams.get('add_account') === '1';

	if (!addAccount && !brandId) {
		return NextResponse.redirect(
			`${base}/connections?error=missing_brand&details=${encodeURIComponent('Select a brand first, then connect Threads from Brand channels.')}`
		);
	}

	try {
		const state = createOAuthState();
		await setOAuthStateCookie('threads_oauth_state', state, {
			brandId,
			userId: user.id,
			addAccount: addAccount ? '1' : '0',
		});
		return NextResponse.redirect(threadsAuthorizeUrl(state));
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Threads OAuth not configured';
		return NextResponse.redirect(`${base}/connections?error=threads_not_configured&details=${encodeURIComponent(message)}`);
	}
}
