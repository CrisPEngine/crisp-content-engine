/**
 * Meta /me API — test call for public_profile permission
 *
 * GET /api/meta/me
 *
 * Calls GET /me?fields=id,name using the user's stored Meta token.
 * Useful for Meta "Testing" required API calls and for screen recordings.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import { decryptMetaToken } from '@/lib/meta/graph';

// Match Meta's Testing UI examples
const GRAPH_API_BASE = 'https://graph.facebook.com/v19.0';

export const runtime = 'nodejs';

export async function GET() {
	if (!isMetaPublishingEnabled()) {
		return NextResponse.json({ error: 'Meta publishing is not enabled' }, { status: 404 });
	}

	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const admin = getSupabaseService();
	const { data: connection } = await admin
		.from('meta_connections')
		.select('access_token_encrypted')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!connection?.access_token_encrypted) {
		return NextResponse.json(
			{ error: 'Meta not connected. Connect Instagram/Facebook first.' },
			{ status: 400 }
		);
	}

	const accessToken = decryptMetaToken(connection.access_token_encrypted);
	if (!accessToken) {
		return NextResponse.json({ error: 'Invalid stored token. Reconnect Meta.' }, { status: 400 });
	}

	const url = `${GRAPH_API_BASE}/me?fields=id,name&access_token=${accessToken}`;
	const res = await fetch(url);

	if (!res.ok) {
		const errorText = await res.text();
		console.warn('[Meta /me] API error:', errorText);
		return NextResponse.json({ error: 'Meta API error', details: errorText }, { status: 502 });
	}

	const data = await res.json();
	console.log('[Meta /me] Success');
	return NextResponse.json({ _meta: { called: 'v19.0/me?fields=id,name' }, ...data });
}

