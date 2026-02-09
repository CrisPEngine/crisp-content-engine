/**
 * Select Default Facebook Page
 * 
 * Sets one page as selected (default publish destination).
 * Phase 1: Only one page can be selected at a time.
 * 
 * Uses deselect-all → select-one pattern.
 * The partial unique index on (user_id) WHERE is_selected = true
 * enforces that only one page can be selected per user at the DB level.
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
	const pageId = body?.pageId;

	if (!pageId) {
		return NextResponse.json(
			{ error: 'Missing pageId' },
			{ status: 400 }
		);
	}

	const admin = getSupabaseService();

	// Verify page belongs to user and has a token (required for publishing)
	const { data: page } = await admin
		.from('meta_pages')
		.select('id, page_id, page_access_token_encrypted')
		.eq('user_id', user.id)
		.eq('page_id', pageId)
		.maybeSingle();

	if (!page) {
		return NextResponse.json(
			{ error: 'Page not found or unauthorized' },
			{ status: 404 }
		);
	}

	if (!page.page_access_token_encrypted) {
		return NextResponse.json(
			{ error: 'This page has no access token. Please reconnect your Meta account.' },
			{ status: 400 }
		);
	}

	// Deselect all pages for this user first, then select the chosen one.
	// Both use service role so they bypass RLS.
	// The partial unique index prevents two pages being selected simultaneously.
	await admin
		.from('meta_pages')
		.update({ is_selected: false })
		.eq('user_id', user.id)
		.eq('is_selected', true); // Only touch the currently-selected row (faster)

	const { error: selectError } = await admin
		.from('meta_pages')
		.update({ is_selected: true })
		.eq('id', page.id);

	if (selectError) {
		console.error('[Meta Pages Select] Error:', selectError);
		return NextResponse.json(
			{ error: 'Failed to select page' },
			{ status: 500 }
		);
	}

	return NextResponse.json({ ok: true });
}
