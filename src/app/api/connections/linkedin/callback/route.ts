import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { encryptToken } from '@/lib/encryption';

export const runtime = 'nodejs';

async function exchangeCodeForTokens(code: string, redirectUri: string) {
	const clientId = process.env.LINKEDIN_CLIENT_ID;
	const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error('LinkedIn client credentials not configured');
	}

	const body = new URLSearchParams();
	body.set('grant_type', 'authorization_code');
	body.set('code', code);
	body.set('redirect_uri', redirectUri);
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
		throw new Error(`LinkedIn token exchange failed: ${errorText}`);
	}

	return res.json();
}

async function fetchLinkedInProfile(accessToken: string) {
	// Try the new OIDC userinfo endpoint first (for openid, profile, email scopes)
	let res = await fetch('https://api.linkedin.com/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	// If that fails, fall back to the legacy v2/me endpoint
	if (!res.ok) {
		res = await fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
	}

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to fetch LinkedIn profile: ${errorText}`);
	}

	return res.json();
}

function extractProfileDetails(profile: any) {
	// Handle OIDC userinfo format (new)
	if (profile?.sub) {
		// OIDC format: sub is the user ID, given_name/family_name for names, picture for avatar
		const firstName = profile?.given_name ?? '';
		const lastName = profile?.family_name ?? '';
		const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || profile?.name || 'LinkedIn Member';
		const personUrn = profile?.sub ? `urn:li:person:${profile.sub}` : null;
		
		return {
			personUrn,
			displayName,
			avatarUrl: profile?.picture ?? null,
		};
	}

	// Handle legacy v2/me format (fallback)
	const firstName = profile?.localizedFirstName ?? '';
	const lastName = profile?.localizedLastName ?? '';
	const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();
	const imageStreams = profile?.profilePicture?.['displayImage~']?.elements ?? [];
	const lastElement = imageStreams[imageStreams.length - 1];
	const avatarUrl = lastElement?.identifiers?.[0]?.identifier ?? null;

	return {
		personUrn: profile?.id ? `urn:li:person:${profile.id}` : null,
		displayName: displayName || 'LinkedIn Member',
		avatarUrl,
	};
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const error = url.searchParams.get('error');

	const redirectBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.crispdigital.io';
	const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${redirectBase}/api/connections/linkedin/callback`;

	if (error) {
		console.error('LinkedIn OAuth error:', error);
		return NextResponse.redirect(`${redirectBase}/connections?error=${encodeURIComponent(error)}`);
	}

	if (!code || !state) {
		return NextResponse.redirect(`${redirectBase}/connections?error=invalid_response`);
	}

	const cookieStore = await cookies();
	const storedState = cookieStore.get('linkedin_oauth_state')?.value;
	cookieStore.set('linkedin_oauth_state', '', { path: '/', maxAge: 0 });

	if (!storedState || storedState !== state) {
		return NextResponse.redirect(`${redirectBase}/connections?error=state_mismatch`);
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.redirect(`${redirectBase}/login`);
	}

	try {
		const tokenResponse = await exchangeCodeForTokens(code, redirectUri);
		const accessToken = tokenResponse.access_token as string;
		const refreshToken = tokenResponse.refresh_token as string | undefined;
		const expiresIn = tokenResponse.expires_in as number | undefined;
		const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

		const profile = await fetchLinkedInProfile(accessToken);
		const details = extractProfileDetails(profile);
		if (!details.personUrn) {
			throw new Error('Missing LinkedIn person URN');
		}

		const admin = getSupabaseService();
		await admin.from('social_connections').upsert({
			user_id: user.id,
			provider: 'linkedin',
			access_token: encryptToken(accessToken),
			refresh_token: refreshToken ? encryptToken(refreshToken) : null,
			expires_at: expiresAt?.toISOString() ?? null,
			person_urn: details.personUrn,
			account_name: details.displayName,
			account_avatar: details.avatarUrl,
			metadata: profile,
			updated_at: new Date().toISOString(),
		});

		return NextResponse.redirect(`${redirectBase}/connections?connected=linkedin`);
	} catch (err: any) {
		console.error('LinkedIn OAuth callback error:', err);
		console.error('Error details:', {
			message: err?.message,
			stack: err?.stack,
			name: err?.name,
		});
		// Include error message in URL for debugging (will be visible in browser console)
		const errorMsg = err?.message ? encodeURIComponent(err.message.substring(0, 100)) : 'linkedin_auth_failed';
		return NextResponse.redirect(`${redirectBase}/connections?error=linkedin_auth_failed&details=${errorMsg}`);
	}
}
