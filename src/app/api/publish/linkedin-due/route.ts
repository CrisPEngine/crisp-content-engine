/**
 * Scheduled Job: Publish Due LinkedIn Content
 * 
 * This endpoint can be called by:
 * 1. Vercel cron (daily on Hobby plan, or more frequently on Pro)
 * 2. External cron services (cron-job.org, EasyCron, etc.) for free frequent publishing
 * 
 * Security: Requires X-Cron-Secret header matching CRON_SECRET env variable
 * 
 * For setup instructions, see FREE_CRON_SETUP.md
 * 
 * Queries Airtable directly for posts matching:
 * - platform = "LinkedIn"
 * - status = "Ready To Publish"
 * - publish_attempts < 3
 * 
 * Then checks scheduled_time in code to publish posts that are due.
 * Works for both personal and company brand posts.
 * 
 * Note: scheduled_time is stored in UTC in Airtable. No timezone conversion needed.
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { getLinkedInConnectionByBrand, publishToLinkedIn, refreshLinkedInToken } from '@/lib/linkedin/publish';

export const runtime = 'nodejs';
export const maxDuration = 300; // Personal brand publishing fixes deployed // 5 minutes max for Vercel

interface ContentRecord {
	id: string;
	fields: {
		brand_profile_id?: string | string[];
		user_id?: string;
		platform?: string;
		status?: string;
		scheduled_time?: string;
		scheduled_timezone?: string;
		hook?: string; // Title/hook field in Airtable
		post_title?: string;
		post_content?: string;
		content?: string;
		post_body?: string;
		hashtags?: string;
		image_reference_url?: string;
		publish_attempts?: number;
		publish_error?: string;
	};
}

/**
 * Get user_id from brand_profile_id
 */
async function getUserIdFromBrandProfile(
	brandProfileId: string,
	baseId: string,
	brandProfilesTable: string,
	token: string
): Promise<string | null> {
	try {
		const url = `https://api.airtable.com/v0/${baseId}/${brandProfilesTable}/${brandProfileId}`;
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});

		if (!res.ok) {
			return null;
		}

		const data = await res.json();
		return data.fields?.user_id || null;
	} catch (error) {
		console.error('Error fetching brand profile:', error);
		return null;
	}
}

/**
 * Update Airtable record with publish result
 */
async function updateAirtableRecord(
	recordId: string,
	baseId: string,
	tableId: string,
	token: string,
	updates: {
		status?: string;
		published_at?: string;
		published_url?: string;
		linkedin_post_id?: string;
		publish_error?: string;
		publish_attempts?: number;
	}
): Promise<void> {
	const fields: Record<string, any> = {};
	if (updates.status) fields.status = updates.status;
	if (updates.published_at) fields.published_at = updates.published_at;
	if (updates.published_url) fields.published_url = updates.published_url;
	if (updates.linkedin_post_id) fields.linkedin_post_id = updates.linkedin_post_id;
	if (updates.publish_error !== undefined) fields.publish_error = updates.publish_error;
	if (updates.publish_attempts !== undefined) fields.publish_attempts = updates.publish_attempts;

	await fetch(`https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`, {
		method: 'PATCH',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ fields }),
	});
}

/**
 * Increment usage count for user
 */
async function incrementUsage(userId: string): Promise<void> {
	try {
		const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
		await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/usage/increment`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(apiKey && { 'x-api-key': apiKey }),
			},
			body: JSON.stringify({ userId, count: 1 }),
		});
	} catch (error) {
		console.error('Failed to increment usage:', error);
		// Don't fail the publish if usage increment fails
	}
}

/**
 * Check if content is due to be published
 * scheduled_time is stored in UTC, compare directly with UTC now
 */
function isContentDue(scheduledTime: string | null | undefined): boolean {
	// If no scheduled_time, treat as "publish immediately"
	if (!scheduledTime) {
		console.log('[isContentDue] No scheduled_time, treating as due');
		return true;
	}

	try {
		// Parse scheduled_time (Airtable returns ISO string in UTC)
		const scheduledDate = new Date(scheduledTime);
		const now = new Date();

		// Check if scheduled date is valid
		if (isNaN(scheduledDate.getTime())) {
			console.warn(`[isContentDue] Invalid scheduled_time format: ${scheduledTime}, treating as due`);
			return true; // If we can't parse, treat as due to avoid blocking
		}

		// scheduled_time is in UTC, now is also UTC, direct comparison
		// Add 1 minute buffer to account for any timezone/parsing issues
		const bufferMs = 60 * 1000; // 1 minute
		const isDue = now.getTime() >= (scheduledDate.getTime() - bufferMs);
		
		console.log(`[isContentDue] scheduledTime=${scheduledTime}, scheduledDate=${scheduledDate.toISOString()}, now=${now.toISOString()}, isDue=${isDue}`);
		
		return isDue;
	} catch (error) {
		console.error('[isContentDue] Error parsing scheduled_time:', error, scheduledTime);
		// If we can't parse, treat as due to avoid blocking posts
		return true;
	}
}

/**
 * Main function to publish due content
 */
async function publishDueContent(): Promise<{
	processed: number;
	success: number;
	failed: number;
	errors: string[];
}> {
	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;
	const BRANDPROFILES_TABLE = process.env.AIRTABLE_BRANDPROFILES_TABLE;

	if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID || !BRANDPROFILES_TABLE) {
		throw new Error('Airtable configuration missing');
	}

	const stats = {
		processed: 0,
		success: 0,
		failed: 0,
		errors: [] as string[],
	};

	// Query directly instead of using view to avoid view filter issues
	// Filter for LinkedIn posts that are Ready To Publish with low attempt count
	const filterFormula = `AND(
		{platform} = "LinkedIn",
		{status} = "Ready To Publish",
		OR({publish_attempts} < 3, {publish_attempts} = BLANK())
	)`;

	// Query directly (bypassing view) to ensure we get all matching records
	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
	url.searchParams.set('filterByFormula', filterFormula);
	url.searchParams.set('maxRecords', '100'); // Process up to 100 records per run
	
	// Only request fields we need for publishing
	// Airtable requires each field as a separate query param
	// Note: 'id' is not a field - it's automatically returned as record.id
	const fields = [
		'platform',
		'status',
		'hook', // Title/hook field in Airtable
		'post_content',
		'hashtags',
		'scheduled_time',
		'brand_profile_id',
		'publish_attempts',
		'image_reference_url', // Include image URL for posts with images
	];
	fields.forEach((field) => {
		url.searchParams.append('fields[]', field);
	});

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${AIRTABLE_TOKEN}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Failed to fetch content queue: ${errorText}`);
	}

	const data = await response.json();
	const records: ContentRecord[] = data.records || [];
	
	console.log(`Found ${records.length} records matching filter: platform=LinkedIn, status=Ready To Publish`);

	// Process each record
	for (const record of records) {
		stats.processed++;

		// Declare variables in outer scope for error handling
		let brandProfileId: string | null = null;
		let userId: string | null = null;

		try {
			const fields = record.fields;

			// Check if content is due (scheduled_time is in UTC)
			const scheduledTime = fields.scheduled_time;
			const isDue = isContentDue(scheduledTime);
			const now = new Date().toISOString();
			
			console.log(`[Publish Job] Record ${record.id}:`, {
				scheduled_time: scheduledTime,
				isDue,
				now,
				hook: fields.hook?.substring(0, 50) || 'no hook',
			});
			
			if (!isDue) {
				console.log(`Skipping record ${record.id}: scheduled_time ${scheduledTime} is not due yet (now: ${now})`);
				stats.processed--; // Don't count skipped records as processed
				continue; // Skip if not due yet
			}

			// Get user_id from brand_profile_id
			brandProfileId = Array.isArray(fields.brand_profile_id)
				? (fields.brand_profile_id[0] || null)
				: (fields.brand_profile_id || null);

			if (!brandProfileId) {
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'No brand_profile_id found',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: No brand_profile_id`);
				continue;
			}

			userId = fields.user_id || (await getUserIdFromBrandProfile(brandProfileId, BASE_ID, BRANDPROFILES_TABLE, AIRTABLE_TOKEN));

			if (!userId) {
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'Could not resolve user_id from brand_profile_id',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Could not resolve user_id`);
				continue;
			}

			// Get LinkedIn connection by brand_profile_id (uses brand assignment)
			console.log(`[Publish Job] Looking up LinkedIn connection for brand ${brandProfileId} (record ${record.id})`);
			const connectionResult = await getLinkedInConnectionByBrand(brandProfileId);
			
			if (!connectionResult) {
				console.error(`[Publish Job] No LinkedIn connection found for brand ${brandProfileId} (record ${record.id}, user ${userId})`);
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'No LinkedIn connection found for this brand. Please assign a LinkedIn connection to the brand in Settings > Connections.',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: No LinkedIn connection for brand ${brandProfileId}`);
				continue;
			}
			
			// Log connection details for debugging
			if ('error' in connectionResult) {
				console.error(`[Publish Job] Connection error for brand ${brandProfileId}:`, connectionResult.error);
				console.error(`[Publish Job] Connection error details:`, {
					error: connectionResult.error,
					isPermanent: connectionResult.isPermanent,
					requiresReconnect: connectionResult.requiresReconnect,
					brandProfileId,
					userId,
					recordId: record.id,
				});
			} else {
				console.log(`[Publish Job] Found connection for brand ${brandProfileId}:`, {
					connectionType: connectionResult.connectionType,
					hasPersonUrn: !!connectionResult.personUrn,
					personUrn: connectionResult.personUrn || 'none',
					hasOrgUrn: !!connectionResult.organizationUrn,
					organizationUrn: connectionResult.organizationUrn || 'none',
					brandProfileId,
					userId,
					recordId: record.id,
				});
			}

			// Check if connection result is an error (permanent failure)
			if ('error' in connectionResult) {
				const attempts = (fields.publish_attempts || 0) + 1;
				const newStatus = connectionResult.isPermanent ? 'Failed' : 'Ready To Publish';

				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: newStatus,
					publish_error: connectionResult.error,
					publish_attempts: attempts,
				});

				stats.failed++;
				stats.errors.push(`Record ${record.id}: ${connectionResult.error}`);
				continue;
			}

			const connection = connectionResult; // TypeScript now knows it's LinkedInConnectionResult

			// Build content
			// Use 'hook' field for title (this is the Airtable field name)
			const title = fields.hook || fields.post_title || '';
			const body = fields.post_content || fields.content || fields.post_body || '';
			const hashtags = fields.hashtags || '';

			if (!body.trim()) {
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'Post content is empty',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Empty content`);
				continue;
			}

			// Get image URL if available
			const imageUrl = fields.image_reference_url || '';

			// Validate we have the required URN for publishing
			// For organization connections, we need organizationUrn
			// For member connections, we need personUrn
			if (connection.connectionType === 'organization' && !connection.organizationUrn) {
				console.error(`[Publish Job] Organization connection missing organizationUrn for record ${record.id}`);
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'LinkedIn organization connection is missing organization URN. Please reconnect your LinkedIn business account.',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Missing organization URN`);
				continue;
			}
			
			if (connection.connectionType === 'member' && !connection.personUrn) {
				console.error(`[Publish Job] Member connection missing personUrn for record ${record.id}`);
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'LinkedIn personal connection is missing person URN. Please reconnect your LinkedIn account.',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Missing person URN`);
				continue;
			}

			// Publish to LinkedIn with idempotency key (record ID)
			// For organization connections, pass organizationUrn as separate parameter
			// For member connections, pass personUrn as first parameter
			const personUrnForPublish = connection.connectionType === 'organization' 
				? (connection.personUrn || '') // May be empty for org connections
				: connection.personUrn!; // Required for member connections (we validated above)
			
			console.log(`[Publish Job] Publishing to LinkedIn:`, {
				recordId: record.id,
				brandProfileId,
				userId,
				connectionType: connection.connectionType,
				personUrn: personUrnForPublish || 'none',
				orgUrn: connection.organizationUrn || 'none',
				hasImage: !!imageUrl,
				imageUrl: imageUrl || 'none',
				title: title.substring(0, 50) + (title.length > 50 ? '...' : ''),
				bodyLength: body.length,
			});
			
			let publishResult = await publishToLinkedIn(
				connection.accessToken,
				personUrnForPublish, // Person URN (required parameter, may be empty for org)
				{
					title,
					body,
					hashtags,
					imageUrl: imageUrl || undefined,
				},
				record.id, // Idempotency key
				connection.organizationUrn // Pass organization URN if present (used as author for org posts)
			);
			
			// If token was revoked, try to refresh and retry once
			if (!publishResult.success && publishResult.requiresTokenRefresh) {
				console.log(`[Publish Job] Token revoked for record ${record.id}, attempting refresh and retry...`);
				
				try {
					const admin = getSupabaseService();
					const { decryptToken, encryptToken } = await import('@/lib/encryption');
					
					// Fetch the full connection from database using the connection ID we stored
					const { data: dbConnection, error: dbError } = await admin
						.from('social_connections')
						.select('id, refresh_token, user_id, provider, connection_type')
						.eq('id', connection.connectionId)
						.single();

					if (dbError || !dbConnection) {
						console.error(`[Publish Job] Failed to fetch connection ${connection.connectionId}:`, dbError);
						throw new Error(`Could not find connection ${connection.connectionId} in database`);
					}

					if (!dbConnection.refresh_token) {
						console.error(`[Publish Job] Connection ${connection.connectionId} has no refresh_token`);
						throw new Error('Connection does not have a refresh token. Please reconnect your LinkedIn account.');
					}

					const refreshToken = decryptToken(dbConnection.refresh_token);
					if (!refreshToken) {
						throw new Error('Could not decrypt refresh token');
					}

					const refreshResponse = await refreshLinkedInToken(refreshToken);
					const now = Date.now();
					const newExpiresAt = refreshResponse.expires_in
						? now + refreshResponse.expires_in * 1000
						: null;
					const newRefreshToken = refreshResponse.refresh_token || refreshToken;
					const newAccessToken = refreshResponse.access_token;

					// Update connection in database
					await admin
						.from('social_connections')
						.update({
							access_token: encryptToken(newAccessToken),
							refresh_token: newRefreshToken ? encryptToken(newRefreshToken) : null,
							expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
							updated_at: new Date().toISOString(),
						})
						.eq('id', dbConnection.id);

					console.log(`[Publish Job] Token refreshed successfully, retrying publish for record ${record.id}...`);
					
					// Retry publish with new token
					publishResult = await publishToLinkedIn(
						newAccessToken,
						personUrnForPublish,
						{
							title,
							body,
							hashtags,
							imageUrl: imageUrl || undefined,
						},
						record.id,
						connection.organizationUrn
					);
				} catch (refreshError: any) {
					console.error(`[Publish Job] Failed to refresh token for record ${record.id}:`, refreshError);
					// Keep the original error result but update it to indicate refresh failed
					publishResult.error = `Token refresh failed. Please reconnect your LinkedIn account. Original error: ${publishResult.error}`;
				}
			}
			
			console.log(`[Publish Job] Publish result for record ${record.id}: success=${publishResult.success}, error=${publishResult.error || 'none'}`);

			if (publishResult.success) {
				// Success: Update Airtable IMMEDIATELY to prevent duplicate processing
				// Do this before any other network calls
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Published',
					published_at: new Date().toISOString(),
					published_url: publishResult.published_url || undefined,
					linkedin_post_id: publishResult.linkedin_post_id || undefined,
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});

				// Increment usage (non-blocking - don't fail if this errors)
				incrementUsage(userId).catch((err) => {
					console.error(`Failed to increment usage for user ${userId}:`, err);
					// Status is already Published, so we don't rollback
				});

				stats.success++;
			} else {
				// Failure: Update Airtable with error
				const attempts = (fields.publish_attempts || 0) + 1;
				const newStatus = attempts >= 3 ? 'Failed' : 'Ready To Publish';

				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: newStatus,
					publish_error: publishResult.error || 'Unknown error',
					publish_attempts: attempts,
				});

				stats.failed++;
				stats.errors.push(`Record ${record.id}: ${publishResult.error}`);
			}
		} catch (error: any) {
			// Handle unexpected errors
			const attempts = (record.fields.publish_attempts || 0) + 1;
			const newStatus = attempts >= 3 ? 'Failed' : 'Ready To Publish';

			const errorMessage = error?.message || 'Unexpected error during publishing';
			console.error(`Publishing error for record ${record.id}:`, {
				error: errorMessage,
				errorStack: error?.stack,
				brandProfileId: brandProfileId || 'unknown',
				userId: userId || 'unknown',
				attempts,
			});

			await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
				status: newStatus,
				publish_error: errorMessage,
				publish_attempts: attempts,
			});

			stats.failed++;
			stats.errors.push(`Record ${record.id}: ${errorMessage}`);
		}
	}

	return stats;
}

/**
 * GET/POST endpoint for cron job
 * Can be called by Vercel Cron or external cron service
 */
export async function GET(request: Request) {
	// Verify cron secret for external cron services
	const cronSecret = request.headers.get('x-cron-secret');
	const expectedSecret = process.env.CRON_SECRET;

	// If CRON_SECRET is configured, require it
	if (expectedSecret) {
		if (!cronSecret || cronSecret !== expectedSecret) {
			console.warn('Unauthorized cron job attempt - missing or invalid secret');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
	} else {
		// If not configured, log a warning but allow (for development/testing)
		console.warn('CRON_SECRET not configured - endpoint is unsecured');
	}

	try {
		const stats = await publishDueContent();
		return NextResponse.json({
			ok: true,
			...stats,
		});
	} catch (error: any) {
		console.error('Publish job error:', error);
		return NextResponse.json(
			{
				ok: false,
				error: error?.message || 'Failed to run publish job',
			},
			{ status: 500 }
		);
	}
}

export async function POST(request: Request) {
	// Same as GET, for flexibility
	return GET(request);
}

