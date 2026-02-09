/**
 * Select Default Instagram Account
 * 
 * Sets one Instagram account as selected (default publish destination).
 * Phase 1: Only one IG account can be selected at a time.
 * 
 * Uses deselect-all → select-one pattern.
 * The partial unique index on (user_id) WHERE is_selected = true
 * enforces that only one IG account can be selected per user at the DB level.
 * 
 * Feature-flagged: requires META_PUBLISHING_ENABLED=true
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	// Feature flag check
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

	const body = await request.json().catch(() => ({}));
	const igUserId = body?.igUserId;

	if (!igUserId) {
		return NextResponse.json(
			{ error: 'Missing igUserId' },
			{ status: 400 }
		);
	}

	const admin = getSupabaseService();

	// Verify IG account belongs to user
	const { data: account } = await admin
		.from('meta_instagram_accounts')
		.select('id, ig_user_id')
		.eq('user_id', user.id)
		.eq('ig_user_id', igUserId)
		.maybeSingle();

	if (!account) {
		return NextResponse.json(
			{ error: 'Instagram account not found or unauthorized' },
			{ status: 404 }
		);
	}

	// Deselect all IG accounts for this user first, then select the chosen one.
	// Both use service role so they bypass RLS.
	// The partial unique index prevents two accounts being selected simultaneously.
	await admin
		.from('meta_instagram_accounts')
		.update({ is_selected: false })
		.eq('user_id', user.id)
		.eq('is_selected', true); // Only touch the currently-selected row (faster)

	const { error: selectError } = await admin
		.from('meta_instagram_accounts')
		.update({ is_selected: true })
		.eq('id', account.id);

	if (selectError) {
		console.error('[Meta IG Select] Error:', selectError);
		return NextResponse.json(
			{ error: 'Failed to select Instagram account' },
			{ status: 500 }
		);
	}

	return NextResponse.json({ ok: true });
}
