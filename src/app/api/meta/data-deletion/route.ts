import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import crypto from 'crypto';

export const runtime = 'nodejs';

/**
 * Meta Data Deletion Callback
 * 
 * Required for Meta App Review compliance (GDPR/CCPA).
 * This endpoint is called by Meta when a user requests data deletion
 * through their Facebook account settings.
 * 
 * Endpoint must:
 * 1. Accept signed_request from Meta
 * 2. Verify signature using APP_SECRET
 * 3. Delete all user data associated with the Facebook user ID
 * 4. Return confirmation URL and code
 * 
 * Documentation: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */
export async function POST(request: Request) {
	try {
		// Feature flag guard
		if (!isMetaPublishingEnabled()) {
			return NextResponse.json({ error: 'Meta publishing is disabled' }, { status: 404 });
		}

		const APP_SECRET = process.env.META_APP_SECRET;
		if (!APP_SECRET) {
			console.error('[Meta Data Deletion] META_APP_SECRET not configured');
			return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
		}

		// Parse request body
		const body = await request.json().catch(() => ({}));
		const signedRequest = body.signed_request;

		if (!signedRequest) {
			return NextResponse.json({ error: 'Missing signed_request parameter' }, { status: 400 });
		}

		// Parse and verify signed request
		const [encodedSig, payload] = signedRequest.split('.');
		if (!encodedSig || !payload) {
			return NextResponse.json({ error: 'Invalid signed_request format' }, { status: 400 });
		}

		// Verify signature
		const expectedSig = crypto
			.createHmac('sha256', APP_SECRET)
			.update(payload)
			.digest('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');

		const providedSig = encodedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

		if (expectedSig !== providedSig) {
			console.error('[Meta Data Deletion] Signature verification failed');
			return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
		}

		// Decode payload
		const decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
		const data = JSON.parse(decodedPayload);

		const facebookUserId = data.user_id;
		if (!facebookUserId) {
			return NextResponse.json({ error: 'Missing user_id in payload' }, { status: 400 });
		}

		console.log(`[Meta Data Deletion] Request received for Facebook user: ${facebookUserId}`);

		// Delete user data from Supabase
		await deleteUserData(facebookUserId);

		// Generate confirmation code
		const confirmationCode = crypto.randomBytes(16).toString('hex');

		// Log deletion request
		console.log(`[Meta Data Deletion] Data deleted for Facebook user: ${facebookUserId}, confirmation code: ${confirmationCode}`);

		// Return confirmation URL and code (required by Meta)
		const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io'}/data-deletion-status?code=${confirmationCode}`;

		return NextResponse.json({
			url: statusUrl,
			confirmation_code: confirmationCode,
		});
	} catch (error: any) {
		console.error('[Meta Data Deletion] Error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * Delete all Meta-related data for a Facebook user
 */
async function deleteUserData(facebookUserId: string): Promise<void> {
	const admin = getSupabaseService();

	try {
		// Find user_id(s) associated with this Facebook user ID
		const { data: connections, error: fetchError } = await admin
			.from('meta_connections')
			.select('user_id')
			.eq('facebook_user_id', facebookUserId);

		if (fetchError) {
			console.error('[Meta Data Deletion] Error fetching connections:', fetchError);
			throw new Error('Failed to fetch user connections');
		}

		if (!connections || connections.length === 0) {
			console.log(`[Meta Data Deletion] No connections found for Facebook user: ${facebookUserId}`);
			return; // No data to delete
		}

		// Delete data for each user_id
		for (const conn of connections) {
			const userId = conn.user_id;

			// Delete Instagram accounts
			const { error: igError } = await admin
				.from('meta_instagram_accounts')
				.delete()
				.eq('user_id', userId);

			if (igError) {
				console.error(`[Meta Data Deletion] Error deleting Instagram accounts for user ${userId}:`, igError);
			}

			// Delete Pages
			const { error: pagesError } = await admin
				.from('meta_pages')
				.delete()
				.eq('user_id', userId);

			if (pagesError) {
				console.error(`[Meta Data Deletion] Error deleting pages for user ${userId}:`, pagesError);
			}

			// Mark pending publish jobs as failed
			const { error: jobsError } = await admin
				.from('publish_jobs')
				.update({
					status: 'failed',
					error_message: 'User requested data deletion',
					updated_at: new Date().toISOString(),
				})
				.eq('user_id', userId)
				.in('platform', ['facebook', 'instagram'])
				.in('status', ['queued', 'retrying', 'publishing']);

			if (jobsError) {
				console.error(`[Meta Data Deletion] Error updating publish jobs for user ${userId}:`, jobsError);
			}

			// Delete connection (this will cascade delete due to foreign keys)
			const { error: connError } = await admin
				.from('meta_connections')
				.delete()
				.eq('user_id', userId);

			if (connError) {
				console.error(`[Meta Data Deletion] Error deleting connection for user ${userId}:`, connError);
			}

			console.log(`[Meta Data Deletion] Successfully deleted data for user: ${userId}`);
		}
	} catch (error) {
		console.error('[Meta Data Deletion] Critical error during data deletion:', error);
		throw error;
	}
}
