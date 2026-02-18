/**
 * Meta Businesses API — test call for business_management permission
 *
 * GET /api/meta/businesses
 *
 * Calls GET /me/businesses with the user's stored token. Use this to:
 * 1. Satisfy Meta's "required API test call" for business_management (trigger once).
 * 2. See the raw response during screen recording or debugging.
 *
 * Requires: user signed in, Meta connected (Connect Instagram/Facebook completed once).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import { decryptMetaToken } from '@/lib/meta/graph';

const GRAPH_API_BASE = 'https://graph.facebook.com/v24.0';

export const runtime = 'nodejs';

export async function GET() {
	if (!isMetaPublishingEnabled()) {
		return NextResponse.json(
			{ error: 'Meta publishing is not enabled' },
			{ status: 404 }
		);
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
		return NextResponse.json(
			{ error: 'Invalid stored token. Reconnect Meta.' },
			{ status: 400 }
		);
	}

	const url = `${GRAPH_API_BASE}/me/businesses?access_token=${accessToken}`;
	const res = await fetch(url);

	if (!res.ok) {
		const errorText = await res.text();
		console.warn('[Meta /me/businesses] API error:', errorText);
		return NextResponse.json(
			{ error: 'Meta API error', details: errorText },
			{ status: 502 }
		);
	}

	const data = await res.json();
	console.log('[Meta /me/businesses] Success — business count:', data?.data?.length ?? 0);

	return NextResponse.json(data);
}
