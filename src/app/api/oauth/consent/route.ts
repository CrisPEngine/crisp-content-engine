import { NextResponse } from 'next/server';
import { requireSessionUserId } from '@/lib/agent/session';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { createAuthorizationCode, supabaseOauthStore } from '@/lib/mcp/grants';
import { deniedScopes, readClientMetadata, resourceMatches, safeRedirectUri, scopesFromRequest } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	if (process.env.MCP_OAUTH_ENABLED === 'false') return NextResponse.json({ error: 'OAuth connections are disabled.' }, { status: 503 });
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Sign in to authorize this connection.' }, { status: 401 });
	const body = (await request.json()) as { clientId?: string; redirectUri?: string; codeChallenge?: string; codeChallengeMethod?: string; scope?: string; resource?: string; state?: string; brandIds?: string[]; allBrands?: boolean };
	if (!body.clientId || !body.redirectUri || !body.codeChallenge || body.codeChallengeMethod !== 'S256') {
		return NextResponse.json({ error: 'clientId, redirectUri, and S256 PKCE are required.' }, { status: 400 });
	}
	if (!safeRedirectUri(body.redirectUri) || !resourceMatches(body.resource ?? null, new URL(request.url).origin)) {
		return NextResponse.json({ error: 'The redirect or resource was rejected.' }, { status: 400 });
	}
	const metadata = await readClientMetadata(body.clientId);
	if (!metadata.redirect_uris.includes(body.redirectUri)) return NextResponse.json({ error: 'That redirect is not registered for this client.' }, { status: 400 });
	const brandIds = Array.isArray(body.brandIds) ? body.brandIds.filter((id) => typeof id === 'string') : [];
	if (!body.allBrands) {
		for (const brandId of brandIds) {
			const brain = await getIntelligenceStore().getBrandBrainById(userId, brandId);
			if (!brain) return NextResponse.json({ error: 'One of the selected brands is not available.' }, { status: 403 });
		}
		if (brandIds.length === 0) return NextResponse.json({ error: 'Select at least one brand, or all brands.' }, { status: 400 });
	}
	const scopes = scopesFromRequest(body.scope);
	const issued = createAuthorizationCode({
		ownerUserId: userId,
		clientId: metadata.client_id,
		clientName: metadata.client_name,
		redirectUri: body.redirectUri,
		challenge: body.codeChallenge,
		scopes,
		brandIds: body.allBrands ? [] : brandIds,
		credentialScope: body.allBrands ? 'OWNER_ACCOUNT' : brandIds.length > 1 ? 'SELECTED_BRANDS' : 'BRAND',
	});
	await supabaseOauthStore.saveCode(issued.code);
	const redirect = new URL(body.redirectUri);
	redirect.searchParams.set('code', issued.publicCode);
	if (body.state) redirect.searchParams.set('state', body.state);
	return NextResponse.json({ redirectTo: redirect.toString(), denied: deniedScopes(body.scope ?? ''), grantedScopes: scopes });
}
