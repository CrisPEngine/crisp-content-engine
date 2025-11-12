import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { decryptToken, encryptToken } from '@/lib/encryption';

export const runtime = 'nodejs';

async function refreshAccessToken(refreshToken: string) {
	const clientId = process.env.LINKEDIN_CLIENT_ID;
	const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error('LinkedIn client credentials not configured');
	}

	const body = new URLSearchParams();
	body.set('grant_type', 'refresh_token');
	body.set('refresh_token', refreshToken);
	body.set('client_id', clientId);
	body.set('client_secret', clientSecret);

	const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`LinkedIn refresh failed: ${errorText}`);
	}

	return res.json();
}

export async function GET(request: Request) {
	const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
	const expectedKey = process.env.MAKE_API_KEY;

	if (!expectedKey || apiKey !== expectedKey) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const url = new URL(request.url);
	const userId = url.searchParams.get('userId');

	if (!userId) {
		return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
	}

	const admin = getSupabaseService();
	const { data, error } = await admin
		.from('social_connections')
		.select('*')
		.eq('user_id', userId)
		.eq('provider', 'linkedin')
		.maybeSingle();

	if (error) {
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	if (!data) {
		return NextResponse.json({ error: 'LinkedIn connection not found' }, { status: 404 });
	}

	const decryptedAccessToken = decryptToken(data.access_token);
	let refreshToken = decryptToken(data.refresh_token);

	if (!decryptedAccessToken) {
		return NextResponse.json({ error: 'Access token missing' }, { status: 400 });
	}

	let accessToken: string = decryptedAccessToken;
	let expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
	const now = Date.now();

	if (expiresAt && expiresAt - now < 5 * 60 * 1000 && refreshToken) {
		try {
			const refreshResponse = await refreshAccessToken(refreshToken);
			expiresAt = refreshResponse.expires_in ? now + refreshResponse.expires_in * 1000 : null;
			const newRefresh = refreshResponse.refresh_token || refreshToken;

			accessToken = refreshResponse.access_token as string;

			await admin
				.from('social_connections')
				.update({
					access_token: encryptToken(accessToken),
					refresh_token: newRefresh ? encryptToken(newRefresh) : null,
					expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
					updated_at: new Date().toISOString(),
				})
				.eq('id', data.id);

			refreshToken = newRefresh;
		} catch (err) {
			console.error('LinkedIn refresh error:', err);
			return NextResponse.json({ error: 'Failed to refresh LinkedIn token' }, { status: 500 });
		}
	}

	return NextResponse.json({
		accessToken,
		personUrn: data.person_urn,
		expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
		accountName: data.account_name,
		accountAvatar: data.account_avatar,
	});
}
