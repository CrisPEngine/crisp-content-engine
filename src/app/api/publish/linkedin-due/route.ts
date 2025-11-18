/**
 * Scheduled Job: Publish Due LinkedIn Content
 * 
 * This endpoint should be called by a cron job (Vercel Cron or external service)
 * every 5-10 minutes to publish content that is ready and scheduled.
 * 
 * Query: Find all ContentQueue records where:
 * - platform = "LinkedIn"
 * - status = "Ready To Publish"
 * - scheduled_time <= now (with timezone consideration)
 * - publish_attempts < 3
 * - OR scheduled_time is null (publish immediately)
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
 * Considers scheduled_time and scheduled_timezone
 */
function isContentDue(
	scheduledTime: string | null | undefined,
	scheduledTimezone: string | null | undefined
): boolean {
	// If no scheduled_time, treat as "publish immediately"
	if (!scheduledTime) {
		return true;
	}

	try {
		// Parse scheduled_time (Airtable returns ISO string)
		const scheduledDate = new Date(scheduledTime);
		const now = new Date();

		// Add 2 minute buffer to account for cron timing
		const bufferMs = 2 * 60 * 1000;
		const dueTime = new Date(scheduledDate.getTime() - bufferMs);

		return now >= dueTime;
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

	// Query Airtable for due LinkedIn content
	// Filter: platform = "LinkedIn", status = "Ready To Publish", publish_attempts < 3
	const filterFormula = `AND(
		{platform} = "LinkedIn",
		{status} = "Ready To Publish",
		OR({publish_attempts} < 3, {publish_attempts} = BLANK())
	)`;

	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
	url.searchParams.set('filterByFormula', filterFormula);
	url.searchParams.set('maxRecords', '100'); // Process up to 100 records per run

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

			// Check if content is due (considering scheduled_time and timezone)
			if (!isContentDue(fields.scheduled_time, fields.scheduled_timezone)) {
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
			const connection = await getLinkedInConnection(userId);
			if (!connection) {
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Failed',
					publish_error: 'No LinkedIn connection found for user',
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: No LinkedIn connection`);
				continue;
			}

			// Build content
			const title = fields.post_title || '';
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

			// Publish to LinkedIn
			const publishResult = await publishToLinkedIn(connection.accessToken, connection.personUrn, {
				title,
				body,
				hashtags,
			});

			if (publishResult.success) {
				// Success: Update Airtable
				await updateAirtableRecord(record.id, BASE_ID, TABLE_ID, AIRTABLE_TOKEN, {
					status: 'Published',
					published_at: new Date().toISOString(),
					published_url: publishResult.published_url || undefined,
					publish_attempts: (fields.publish_attempts || 0) + 1,
				});

				// Increment usage
				await incrementUsage(userId);

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
	// Optional: Add authentication for cron
	const authHeader = request.headers.get('authorization');
	const cronSecret = process.env.CRON_SECRET;

	if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

