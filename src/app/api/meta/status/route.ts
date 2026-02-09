/**
 * Meta Connection Status
 * 
 * Returns Meta connection status, selected Page, and selected Instagram account.
 * Feature-flagged: requires META_PUBLISHING_ENABLED=true
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';

export const runtime = 'nodejs';

export async function GET() {
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

	const admin = getSupabaseService();

	// Get connection
	const { data: connection } = await admin
		.from('meta_connections')
		.select('id, facebook_user_id, token_expires_at, scopes_granted')
		.eq('user_id', user.id)
		.maybeSingle();

	if (!connection) {
		return NextResponse.json({ connected: false });
	}

	// Get selected page
	const { data: selectedPage } = await admin
		.from('meta_pages')
		.select('id, page_id, page_name')
		.eq('user_id', user.id)
		.eq('is_selected', true)
		.maybeSingle();

	// Get selected Instagram account
	const { data: selectedIg } = await admin
		.from('meta_instagram_accounts')
		.select('id, ig_user_id, ig_username, connected_page_id')
		.eq('user_id', user.id)
		.eq('is_selected', true)
		.maybeSingle();

	return NextResponse.json({
		connected: true,
		facebookUserId: connection.facebook_user_id,
		tokenExpiresAt: connection.token_expires_at,
		selectedPage: selectedPage ? {
			id: selectedPage.id,
			pageId: selectedPage.page_id,
			pageName: selectedPage.page_name,
		} : null,
		selectedInstagram: selectedIg ? {
			id: selectedIg.id,
			igUserId: selectedIg.ig_user_id,
			igUsername: selectedIg.ig_username,
			connectedPageId: selectedIg.connected_page_id,
		} : null,
	});
}
