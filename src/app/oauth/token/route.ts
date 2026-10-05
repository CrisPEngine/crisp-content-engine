import { NextResponse } from 'next/server';
import { exchangeAuthorizationCode, refreshConnection, supabaseOauthStore } from '@/lib/mcp/grants';
import { resourceMatches } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function oauthError(error: string, status = 400) {
	return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
	if (process.env.MCP_OAUTH_ENABLED === 'false') return oauthError('oauth_disabled', 503);
	const form = await request.formData();
	const grantType = String(form.get('grant_type') ?? '');
	const resource = String(form.get('resource') ?? '');
	if (!resourceMatches(resource, new URL(request.url).origin)) return oauthError('invalid_target');
	try {
		if (grantType === 'authorization_code') {
			const token = await exchangeAuthorizationCode(supabaseOauthStore, {
				code: String(form.get('code') ?? ''),
				verifier: String(form.get('code_verifier') ?? ''),
				redirectUri: String(form.get('redirect_uri') ?? ''),
				clientId: String(form.get('client_id') ?? ''),
				resource,
			});
			return NextResponse.json({ access_token: token.accessToken, token_type: 'Bearer', expires_in: token.expiresIn, refresh_token: token.refreshToken, scope: token.scope });
		}
		if (grantType === 'refresh_token') {
			const token = await refreshConnection(supabaseOauthStore, String(form.get('refresh_token') ?? ''));
			return NextResponse.json({ access_token: token.accessToken, token_type: 'Bearer', expires_in: token.expiresIn, refresh_token: token.refreshToken, scope: token.scope });
		}
		return oauthError('unsupported_grant_type');
	} catch {
		return oauthError('invalid_grant');
	}
}
