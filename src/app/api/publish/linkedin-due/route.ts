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
 * Uses Airtable view "ReadyToPublish_LinkedIn" which filters:
 * - platform = "LinkedIn"
 * - status = "Ready To Publish"
 * 
 * Additional filters applied:
 * - scheduled_time <= now (UTC) OR scheduled_time is null
 * - publish_attempts < 3
 * 
 * Note: scheduled_time is stored in UTC in Airtable. No timezone conversion needed.
 */

import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { getLinkedInConnection, publishToLinkedIn } from '@/lib/linkedin/publish';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for Vercel

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
		publish_error?: string;
		publish_attempts?: number;
	}
): Promise<void> {
	const fields: Record<string, any> = {};
	if (updates.status) fields.status = updates.status;
	if (updates.published_at) fields.published_at = updates.published_at;
	if (updates.published_url) fields.published_url = updates.published_url;
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
		return true;
	}

	try {
		// Parse scheduled_time (Airtable returns ISO string in UTC)
		const scheduledDate = new Date(scheduledTime);
		const now = new Date();

		// scheduled_time is in UTC, now is also UTC, direct comparison
		return now >= scheduledDate;
	} catch (error) {
		console.error('Error parsing scheduled_time:', error);
		// If we can't parse, treat as due
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

	// Query Airtable view "ReadyToPublish_LinkedIn" which pre-filters:
	// - platform = "LinkedIn"
	// - status = "Ready To Publish"
	// Then apply additional filters for scheduled_time and publish_attempts
	const viewName = 'ReadyToPublish_LinkedIn';
	const filterFormula = `AND(
		OR({scheduled_time} <= NOW(), {scheduled_time} = BLANK()),
		OR({publish_attempts} < 3, {publish_attempts} = BLANK())
	)`;

	// Use view endpoint for better performance
	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
	url.searchParams.set('view', viewName);
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

	// Process each record
	for (const record of records) {
		stats.processed++;

		try {
			const fields = record.fields;

			// Check if content is due (scheduled_time is in UTC)
			if (!isContentDue(fields.scheduled_time)) {
				continue; // Skip if not due yet
			}

			// Get user_id from brand_profile_id
			const brandProfileId = Array.isArray(fields.brand_profile_id)
				? fields.brand_profile_id[0]
				: fields.brand_profile_id;

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

			const userId = fields.user_id || (await getUserIdFromBrandProfile(brandProfileId, BASE_ID, BRANDPROFILES_TABLE, AIRTABLE_TOKEN));

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

			// Get LinkedIn connection
			const connectionResult = await getLinkedInConnection(userId);
			if (!connectionResult) {
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'No LinkedIn connection found for user',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: No LinkedIn connection`);
				continue;
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

			// Publish to LinkedIn with idempotency key (record ID)
			const publishResult = await publishToLinkedIn(
				connection.accessToken,
				connection.personUrn,
				{
					title,
					body,
					hashtags,
				},
				record.id // Idempotency key
			);

			if (publishResult.success) {
				// Success: Update Airtable IMMEDIATELY to prevent duplicate processing
				// Do this before any other network calls
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Published',
					published_at: new Date().toISOString(),
					published_url: publishResult.published_url || undefined,
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

			await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
				status: newStatus,
				publish_error: error?.message || 'Unexpected error during publishing',
				publish_attempts: attempts,
			});

			stats.failed++;
			stats.errors.push(`Record ${record.id}: ${error?.message || 'Unexpected error'}`);
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

