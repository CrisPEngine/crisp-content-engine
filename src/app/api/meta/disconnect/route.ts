/**
 * Meta Disconnect
 * 
 * Removes Meta connection and all associated pages, Instagram accounts,
 * and invalidates pending publish jobs.
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

	const admin = getSupabaseService();

	// Delete in order: jobs, IG accounts, pages, connection
	// (cascade should handle this, but being explicit)
	try {
		// Mark pending jobs as failed
		await admin
			.from('publish_jobs')
			.update({
				status: 'failed',
				error_message: 'Meta connection disconnected by user',
			})
			.eq('user_id', user.id)
			.in('platform', ['facebook', 'instagram'])
			.in('status', ['queued', 'retrying']);

		// Delete Instagram accounts
		await admin
			.from('meta_instagram_accounts')
			.delete()
			.eq('user_id', user.id);

		// Delete pages
		await admin
			.from('meta_pages')
			.delete()
			.eq('user_id', user.id);

		// Delete connection
		await admin
			.from('meta_connections')
			.delete()
			.eq('user_id', user.id);

		const url = new URL(request.url);
		const origin = url.origin;
		return NextResponse.redirect(
			new URL('/connections?disconnected=meta', origin)
		);
	} catch (error: any) {
		console.error('[Meta Disconnect] Error:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to disconnect Meta' },
			{ status: 500 }
		);
	}
}
