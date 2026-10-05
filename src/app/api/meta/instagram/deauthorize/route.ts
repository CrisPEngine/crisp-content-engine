import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { parseSignedRequest } from '@/lib/meta/signedRequest';
import { revokeInstagramLoginByProviderAccountId } from '@/lib/social/revokeInstagramLogin';

export const runtime = 'nodejs';

function appSecret(): string | null {
	return process.env.INSTAGRAM_APP_SECRET?.trim() || null;
}

function statusBaseUrl(): string {
	return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
}

async function handleSignedRequest(request: Request, mode: 'deauthorize' | 'deletion') {
	const secret = appSecret();
	if (!secret) {
		console.error('[Instagram Deauthorize/Deletion] INSTAGRAM_APP_SECRET not configured');
		return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
	}

	const body = await request.formData().catch(() => null);
	const signedRequest =
		(body?.get('signed_request') as string | null) ||
		(await request.json().catch(() => ({}))).signed_request;

	if (!signedRequest || typeof signedRequest !== 'string') {
		return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 });
	}

	const data = parseSignedRequest(signedRequest, secret);
	if (!data?.user_id) {
		return NextResponse.json({ error: 'Invalid signed_request' }, { status: 401 });
	}

	const instagramUserId = String(data.user_id);
	console.log(`[Instagram ${mode}] provider account ${instagramUserId}`);

	const result = await revokeInstagramLoginByProviderAccountId(instagramUserId);

	if (mode === 'deauthorize') {
		return NextResponse.json({ success: true, removed: result.removedAuthorizations });
	}

	const confirmationCode = crypto.randomBytes(16).toString('hex');
	const statusUrl = `${statusBaseUrl()}/data-deletion-status?code=${confirmationCode}&provider=instagram`;

	return NextResponse.json({
		url: statusUrl,
		confirmation_code: confirmationCode,
		removed: result.removedAuthorizations,
	});
}

/** Meta Deauthorize callback URL for Instagram Login app settings. */
export async function POST(request: Request) {
	return handleSignedRequest(request, 'deauthorize');
}
