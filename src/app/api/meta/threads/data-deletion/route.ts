import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { parseSignedRequest } from '@/lib/meta/signedRequest';
import { revokeNativeAuthorizationByProviderAccountId } from '@/lib/social/revokeNativeAuthorization';
import { SOCIAL_PROVIDERS } from '@/lib/social/providers';

export const runtime = 'nodejs';

function appSecret(): string | null {
	return process.env.THREADS_APP_SECRET?.trim() || null;
}

function statusBaseUrl(): string {
	return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
}

export async function POST(request: Request) {
	const secret = appSecret();
	if (!secret) {
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

	const threadsUserId = String(data.user_id);
	const result = await revokeNativeAuthorizationByProviderAccountId(SOCIAL_PROVIDERS.THREADS, threadsUserId);
	const confirmationCode = crypto.randomBytes(16).toString('hex');
	const statusUrl = `${statusBaseUrl()}/data-deletion-status?code=${confirmationCode}&provider=threads`;

	return NextResponse.json({
		url: statusUrl,
		confirmation_code: confirmationCode,
		removed: result.removedAuthorizations,
	});
}
