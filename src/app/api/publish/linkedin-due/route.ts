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
import { sendEmail } from '@/lib/email/sendEmail';
import { OAuthReconnectEmail } from '@/emails/product/OAuthReconnectEmail';
import { listRecords, batchUpdate, normalizeLookup } from '@/lib/airtable/client';
import { CONTENTQUEUE_LOOKUP_FIELDS } from '@/lib/airtable/field-mapping';

/**
 * ContentQueue Lookup Fields
 * IMPORTANT: Use field NAMES in fields[] parameter, but responses will be keyed by field IDs
 */
// Field IDs for accessing responses (when returnFieldsByFieldId=true)
const LOOKUP_FIELD_IDS = {
	user_id_lookup: CONTENTQUEUE_LOOKUP_FIELDS.user_id_lookup.id,
	brand_name_lookup: CONTENTQUEUE_LOOKUP_FIELDS.brand_name_lookup.id,
	timezone_lookup: CONTENTQUEUE_LOOKUP_FIELDS.timezone_lookup.id,
} as const;

// Field names for use in fields[] parameter
const LOOKUP_FIELD_NAMES = {
	user_id_lookup: CONTENTQUEUE_LOOKUP_FIELDS.user_id_lookup.name,
	brand_name_lookup: CONTENTQUEUE_LOOKUP_FIELDS.brand_name_lookup.name,
	timezone_lookup: CONTENTQUEUE_LOOKUP_FIELDS.timezone_lookup.name,
} as const;

/**
 * ContentQueue Field IDs (for accessing responses when returnFieldsByFieldId=true)
 * These are the actual field IDs from Airtable
 * IMPORTANT: When returnFieldsByFieldId=true, ALL fields are keyed by IDs, not names
 * 
 * Field ID to Field Name mapping (from Airtable):
 * fldtucAvhPkP0ZWY7 = "client_name"
 * fldDHJ0Rx7Rbzlu4a = "brand_name_lookup"
 * fldXszK9zI99mukqB = "user_id_lookup"
 * fldY4TjWWgthnDiw4 = "platform"
 * fldWqjs9EVHNJjV37 = "topic_bucket"
 * fldVPEPwwoyfEmjIn = "hook"
 * fldxVHLUkrlcxx7Ua = "post_content"
 * fldixSg2juCZLJ7R7 = "hashtags"
 * fldapoV6GTKnQkzD4 = "image_prompt"
 * fldYU7HnycHcwrUFH = "status"
 * fld7ePgW2x14v5e4o = "scheduled_time"
 * fldnI4lMIwnC6jZbo = "scheduled_timezone"
 * fldumyzHN5hyImgti = "created_time"
 * flduEbzJOpC8HYuJn = "last_modified"
 * fldR5AZaDc07gArxv = "publish_text"
 * flduUgRnky0IgKH5K = "record_id"
 * fldqCh274V2Ih2PPS = "brand_profile_id"
 * fld4HM3lrGKUq92kJ = "call_to_action"
 * fldf58Nezm4kywo6T = "image_generation_source"
 * fldRRlsSTQC9IZbt5 = "image_reference_url"
 * fldILkq0eG4tSV6GC = "approved_at"
 * fldIT2FuismZkp9ZU = "published_at"
 * fldCevmF49JFuHkLE = "published_url"
 */
const CONTENTQUEUE_FIELD_IDS = {
	// Core fields
	platform: 'fldY4TjWWgthnDiw4',
	status: 'fldYU7HnycHcwrUFH',
	hook: 'fldVPEPwwoyfEmjIn',
	post_content: 'fldxVHLUkrlcxx7Ua',
	hashtags: 'fldixSg2juCZLJ7R7',
	scheduled_time: 'fld7ePgW2x14v5e4o',
	scheduled_timezone: 'fldnI4lMIwnC6jZbo',
	image_prompt: 'fldapoV6GTKnQkzD4',
	brand_profile_id: 'fldqCh274V2Ih2PPS',
	created_time: 'fldumyzHN5hyImgti',
	last_modified: 'flduEbzJOpC8HYuJn',
	// Additional fields
	client_name: 'fldtucAvhPkP0ZWY7',
	topic_bucket: 'fldWqjs9EVHNJjV37',
	publish_text: 'fldR5AZaDc07gArxv',
	record_id: 'flduUgRnky0IgKH5K',
	call_to_action: 'fld4HM3lrGKUq92kJ',
	image_generation_source: 'fldf58Nezm4kywo6T',
	image_reference_url: 'fldRRlsSTQC9IZbt5',
	approved_at: 'fldILkq0eG4tSV6GC',
	published_at: 'fldIT2FuismZkp9ZU',
	published_url: 'fldCevmF49JFuHkLE',
} as const;

/**
 * Helper to get field value by ID or name (for backward compatibility)
 * When returnFieldsByFieldId=true, fields are keyed by ID, not name
 */
function getFieldValue(fields: any, fieldId: string | undefined, fieldName: string): any {
	if (!fieldId) {
		// No field ID provided, use name only
		return fields[fieldName];
	}
	// Try field ID first (when returnFieldsByFieldId=true), then fallback to name
	return fields[fieldId] ?? fields[fieldName];
}

// Helper function to mark connection as needing reauth and send notification
async function markConnectionNeedsReauthAndNotify(
	admin: ReturnType<typeof getSupabaseService>,
	userId: string,
	connectionId: string,
	provider: string,
	errorMessage: string,
	affectedCount: number
) {
	try {
		// Update connection to mark as needing reauth
		await admin
			.from('social_connections')
			.update({
				needs_reauth: true,
				updated_at: new Date().toISOString(),
			})
			.eq('id', connectionId);

		// Get user profile for email
		const { data: profile } = await admin
			.from('profiles')
			.select('email, full_name')
			.eq('id', userId)
			.maybeSingle();

		if (profile?.email) {
			const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.crispdigital.io';
			// Include redirect_to parameter so users go to connections page after login
			const reconnectUrl = `${appUrl}/login?redirect_to=/connections`;
			const providerName = provider === 'linkedin' ? 'LinkedIn' : provider.charAt(0).toUpperCase() + provider.slice(1);
			
			// Send reconnection email
			await sendEmail({
				to: profile.email,
				subject: 'Action required. Reconnect your LinkedIn account to resume publishing',
				react: OAuthReconnectEmail({
					userName: profile.full_name || undefined,
					provider: provider as 'linkedin' | 'facebook' | 'x' | 'buffer',
					reconnectUrl,
					affectedCount,
				}),
				category: 'system',
			});
		}
	} catch (error) {
		console.error('Failed to mark connection as needing reauth:', error);
		// Don't throw - this is non-critical
	}
}

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
		linkedin_post_id?: string;
		published_url?: string;
		published_at?: string;
	};
}

/**
 * REMOVED: getUserIdFromBrandProfile
 * Now using user_id_lookup field from ContentQueue - no BrandProfiles fetch needed
 */

/**
 * REMOVED: updateAirtableRecord (single record update)
 * Now using batchUpdate for efficiency - updates are batched in groups of 10
 */

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
 * scheduled_time may be in local timezone, convert to UTC using timezone
 */
function isContentDue(scheduledTime: string | null | undefined, timezone?: string | null): boolean {
	// If no scheduled_time, treat as "publish immediately"
	if (!scheduledTime) {
		console.log('[isContentDue] No scheduled_time, treating as due');
		return true;
	}

	try {
		// Parse scheduled_time (Airtable returns ISO string in UTC)
		// Handle various date formats that Airtable might return
		let scheduledDate: Date;
		
		// Try parsing as-is first (ISO format)
		scheduledDate = new Date(scheduledTime);
		
		// If that fails, try parsing as a date string (e.g., "7/1/2026 09:00")
		if (isNaN(scheduledDate.getTime())) {
			// Try parsing as date string with time
			// Format could be MM/DD/YYYY HH:MM (US) or DD/MM/YYYY HH:MM (EU)
			const dateParts = scheduledTime.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
			if (dateParts) {
				const [, part1, part2, year, hour, minute] = dateParts;
				// Airtable typically uses MM/DD/YYYY format for US bases
				// Try MM/DD first, if that creates invalid date, try DD/MM
				const month = part1;
				const day = part2;
				scheduledDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00Z`);
				
				// Validate: if month > 12, it's likely DD/MM format
				if (parseInt(month) > 12) {
					// Swap: it's DD/MM format
					scheduledDate = new Date(`${year}-${day.padStart(2, '0')}-${month.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00Z`);
				}
			} else {
				// Try other common formats
				scheduledDate = new Date(scheduledTime);
			}
		}

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
		
		console.log(`[isContentDue] scheduledTime=${scheduledTime}, scheduledDate=${scheduledDate.toISOString()}, now=${now.toISOString()}, isDue=${isDue}, timeDiff=${(scheduledDate.getTime() - now.getTime()) / 1000 / 60} minutes`);
		
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
	const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

	if (!TABLE_ID) {
		throw new Error('Airtable configuration missing: AIRTABLE_CONTENTQUEUE_TABLE');
	}

	const stats = {
		processed: 0,
		success: 0,
		failed: 0,
		errors: [] as string[],
	};
	
	const admin = getSupabaseService(); // Create admin client once for the function
	const updateQueue: Array<{ id: string; fields: Record<string, any> }> = []; // Batch update queue

	// Filter for LinkedIn posts that are Ready To Publish with low attempt count
	// Note: We don't filter by scheduled_time here because Airtable date comparisons can be tricky
	// We'll check scheduled_time in code after fetching to ensure accurate date parsing
	const filterFormula = `AND(
		{platform} = "LinkedIn",
		{status} = "Ready To Publish",
		OR({publish_attempts} < 3, {publish_attempts} = BLANK())
	)`;

	// SINGLE Airtable call: Fetch due LinkedIn posts with lookup fields
	// IMPORTANT: Use field NAMES in fields[] parameter, responses will be keyed by field IDs
	const records = await listRecords({
		table: TABLE_ID,
		filterByFormula: filterFormula,
		maxRecords: 100,
		fields: [
			// Core content fields (use exact field names from Airtable)
			'platform',
			'status',
			'hook',
			'post_content',
			'hashtags',
			'scheduled_time',
			'brand_profile_id',
			'publish_attempts',
			'image_reference_url',
			'linkedin_post_id',
			'published_url',
			'published_at',
			// Lookup fields (use field NAMES, not IDs)
			LOOKUP_FIELD_NAMES.user_id_lookup,
			LOOKUP_FIELD_NAMES.brand_name_lookup,
			LOOKUP_FIELD_NAMES.timezone_lookup, // Need timezone to convert scheduled_time to UTC
		],
		returnFieldsByFieldId: true, // Get responses keyed by field IDs
		endpoint: '/api/publish/linkedin-due',
	}) as ContentRecord[];
	
	console.log(`[Publish Job] Found ${records.length} records matching filter: platform=LinkedIn, status=Ready To Publish`);

	// Process each record
	for (const record of records) {
		stats.processed++;

		// Declare variables in outer scope for error handling
		let brandProfileId: string | null = null;
		let userId: string | null = null;

		try {
			const fields = record.fields;

			// Helper to access fields - try by ID first (returnFieldsByFieldId=true), then by name
			const getField = (fieldName: string, fieldId?: string) => getFieldValue(fields, fieldId, fieldName);

			// Check if post is already published (has linkedin_post_id or published_url)
			// This prevents duplicate publishing if status wasn't updated
			const linkedinPostId = getField('linkedin_post_id');
			const publishedUrl = getField('published_url', CONTENTQUEUE_FIELD_IDS.published_url);
			if (linkedinPostId || publishedUrl) {
				console.log(`[Publish Job] Record ${record.id} already has published info, syncing status instead of publishing`);
				
				// Queue status update to Published if it's not already
				const status = getField('status', CONTENTQUEUE_FIELD_IDS.status);
				if (status !== 'Published') {
					updateQueue.push({
						id: record.id,
						fields: {
							status: 'Published',
							published_at: getField('published_at', CONTENTQUEUE_FIELD_IDS.published_at) || new Date().toISOString(),
						},
					});
					console.log(`[Publish Job] Queued sync for record ${record.id} status to Published`);
				}
				
				stats.processed--; // Don't count as processed (already published)
				continue; // Skip publishing
			}

			// Check if content is due (scheduled_time is in UTC)
			const scheduledTime = getField('scheduled_time', CONTENTQUEUE_FIELD_IDS.scheduled_time);
			const isDue = isContentDue(scheduledTime);
			const now = new Date().toISOString();
			const hook = getField('hook', CONTENTQUEUE_FIELD_IDS.hook) || '';
			
			console.log(`[Publish Job] Record ${record.id}:`, {
				scheduled_time: scheduledTime,
				isDue,
				now,
				hook: hook.substring(0, 50) || 'no hook',
			});
			
			if (!isDue) {
				console.log(`Skipping record ${record.id}: scheduled_time ${scheduledTime} is not due yet (now: ${now})`);
				stats.processed--; // Don't count skipped records as processed
				continue; // Skip if not due yet
			}

			// Get user_id from user_id_lookup (no BrandProfiles fetch needed)
			// Access by field ID since returnFieldsByFieldId=true
			const userIdLookupValue = (fields as any)[LOOKUP_FIELD_IDS.user_id_lookup];
			userId = normalizeLookup(userIdLookupValue) || getField('user_id') || null;

			if (!userId) {
				// Queue for batch update
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'Could not resolve user_id from lookup field',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Could not resolve user_id`);
				continue;
			}

			// Get brand_profile_id from link field
			// IMPORTANT: With returnFieldsByFieldId=true, we must access by field ID, not name
			// The field ID for brand_profile_id is fldqCh274V2Ih2PPS
			const brandProfileIdField = (fields as any)[CONTENTQUEUE_FIELD_IDS.brand_profile_id] || getField('brand_profile_id');
			
			// Airtable link fields can be arrays (multiple links) or single values
			if (brandProfileIdField) {
				if (Array.isArray(brandProfileIdField)) {
					// Link field returns array - get first linked record ID
					const firstLink: any = brandProfileIdField[0];
					if (typeof firstLink === 'string') {
						brandProfileId = firstLink;
					} else if (firstLink && typeof firstLink === 'object' && 'id' in firstLink) {
						brandProfileId = String((firstLink as any).id);
					} else if (firstLink) {
						brandProfileId = String(firstLink);
					} else {
						brandProfileId = null;
					}
				} else if (typeof brandProfileIdField === 'string') {
					brandProfileId = brandProfileIdField;
				} else if (brandProfileIdField && typeof brandProfileIdField === 'object' && 'id' in (brandProfileIdField as any)) {
					brandProfileId = String((brandProfileIdField as any).id);
				} else {
					brandProfileId = String(brandProfileIdField);
				}
			} else {
				brandProfileId = null;
			}

			if (!brandProfileId) {
				// Queue for batch update
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'No brand_profile_id found. Please link this content to a brand profile in Airtable.',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: No brand_profile_id`);
				continue;
			}

			// Get LinkedIn connection by brand_profile_id (uses brand assignment)
			console.log(`[Publish Job] Looking up LinkedIn connection for brand ${brandProfileId} (record ${record.id})`);
			const connectionResult = await getLinkedInConnectionByBrand(brandProfileId);
			
			if (!connectionResult) {
				console.error(`[Publish Job] No LinkedIn connection found for brand ${brandProfileId} (record ${record.id}, user ${userId})`);
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'No LinkedIn connection found for this brand. Please assign a LinkedIn connection to the brand in Settings > Connections.',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
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
				const attempts = (getField('publish_attempts') || 0) + 1;
				const newStatus = connectionResult.isPermanent ? 'Failed' : 'Ready To Publish';

				updateQueue.push({
					id: record.id,
					fields: {
						status: newStatus,
						publish_error: connectionResult.error,
						publish_attempts: attempts,
					},
				});

				stats.failed++;
				stats.errors.push(`Record ${record.id}: ${connectionResult.error}`);
				continue;
			}

			const connection = connectionResult; // TypeScript now knows it's LinkedInConnectionResult

			// Build content
			// IMPORTANT: Access fields by ID (returnFieldsByFieldId=true) with fallback to name
			const title = getField('hook', CONTENTQUEUE_FIELD_IDS.hook) || getField('post_title') || getField('title') || '';
			const body = getField('post_content', CONTENTQUEUE_FIELD_IDS.post_content) || getField('post_body') || '';
			const hashtags = getField('hashtags', CONTENTQUEUE_FIELD_IDS.hashtags) || '';

			if (!body.trim()) {
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'Post content is empty',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Empty content`);
				continue;
			}

			// Get image URL if available
			const imageUrl = getField('image_reference_url', CONTENTQUEUE_FIELD_IDS.image_reference_url) || '';

			// Validate we have the required URN for publishing
			// For organization connections, we need organizationUrn
			// For member connections, we need personUrn
			if (connection.connectionType === 'organization' && !connection.organizationUrn) {
				console.error(`[Publish Job] Organization connection missing organizationUrn for record ${record.id}`);
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'LinkedIn organization connection is missing organization URN. Please reconnect your LinkedIn business account.',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
				});
				stats.failed++;
				stats.errors.push(`Record ${record.id}: Missing organization URN`);
				continue;
			}
			
			if (connection.connectionType === 'member' && !connection.personUrn) {
				console.error(`[Publish Job] Member connection missing personUrn for record ${record.id}`);
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Failed',
						publish_error: 'LinkedIn personal connection is missing person URN. Please reconnect your LinkedIn account.',
						publish_attempts: (getField('publish_attempts') || 0) + 1,
					},
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
				
				const admin = getSupabaseService();
				try {
					const { decryptToken, encryptToken } = await import('@/lib/encryption');
					
					// Fetch the full connection from database using the connection ID we stored
					const { data: dbConnection, error: dbError } = await admin
						.from('social_connections')
						.select('id, refresh_token, user_id, provider, connection_type, account_name')
						.eq('id', connection.connectionId)
						.single();

					if (dbError || !dbConnection) {
						console.error(`[Publish Job] Failed to fetch connection ${connection.connectionId}:`, dbError);
						const errorMessage = `LinkedIn connection not found. Please reconnect your LinkedIn account in Settings > Connections.`;
						updateQueue.push({
							id: record.id,
							fields: {
								status: 'Failed',
								publish_error: errorMessage,
								publish_attempts: (getField('publish_attempts') || 0) + 1,
							},
						});
						stats.failed++;
						stats.errors.push(`Record ${record.id}: ${errorMessage}`);
						continue;
					}

					if (!dbConnection.refresh_token) {
						console.error(`[Publish Job] Connection ${connection.connectionId} (${dbConnection.account_name || 'unknown'}) has no refresh_token. This connection was likely created before refresh tokens were supported, or LinkedIn did not provide a refresh token. User needs to reconnect.`);
						const errorMessage = `LinkedIn connection expired and cannot be refreshed. Please disconnect and reconnect your LinkedIn account in Settings > Connections.`;
						updateQueue.push({
							id: record.id,
							fields: {
								status: 'Failed',
								publish_error: errorMessage,
								publish_attempts: (getField('publish_attempts') || 0) + 1,
							},
						});
						stats.failed++;
						stats.errors.push(`Record ${record.id}: ${errorMessage}`);
						continue;
					}

					const refreshToken = decryptToken(dbConnection.refresh_token);
					if (!refreshToken) {
						console.error(`[Publish Job] Could not decrypt refresh_token for connection ${connection.connectionId}`);
						const errorMessage = `LinkedIn connection token decryption failed. Please reconnect your LinkedIn account in Settings > Connections.`;
						updateQueue.push({
							id: record.id,
							fields: {
								status: 'Failed',
								publish_error: errorMessage,
								publish_attempts: (getField('publish_attempts') || 0) + 1,
							},
						});
						stats.failed++;
						stats.errors.push(`Record ${record.id}: ${errorMessage}`);
						continue;
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
					const errorMessage = refreshError.message?.includes('reconnect') 
						? refreshError.message 
						: `Token refresh failed: ${refreshError.message || 'Unknown error'}. Please reconnect your LinkedIn account in Settings > Connections.`;
					
					// Mark connection as needing reauth and send email notification
					await markConnectionNeedsReauthAndNotify(
						admin,
						userId,
						connection.connectionId,
						'linkedin',
						errorMessage,
						1 // affectedCount (this post)
					);

					updateQueue.push({
						id: record.id,
						fields: {
							status: 'Failed',
							publish_error: errorMessage,
							publish_attempts: (fields.publish_attempts || 0) + 1,
						},
					});
					stats.failed++;
					stats.errors.push(`Record ${record.id}: ${errorMessage}`);
					continue;
				}
			}
			
			console.log(`[Publish Job] Publish result for record ${record.id}: success=${publishResult.success}, error=${publishResult.error || 'none'}`);

			if (publishResult.success) {
				// Success: Queue update (will batch at end)
				updateQueue.push({
					id: record.id,
					fields: {
						status: 'Published',
						published_at: new Date().toISOString(),
						published_url: publishResult.published_url || undefined,
						linkedin_post_id: publishResult.linkedin_post_id || undefined,
						publish_attempts: (fields.publish_attempts || 0) + 1,
					},
				});
				stats.success++;

				// Increment usage (non-blocking - don't fail if this errors)
				incrementUsage(userId).catch((err) => {
					console.error(`Failed to increment usage for user ${userId}:`, err);
				});
			} else {
				// Failure: Queue update with error
				const attempts = (getField('publish_attempts') || 0) + 1;
				const newStatus = attempts >= 3 ? 'Failed' : 'Ready To Publish';

				// Check if error is OAuth-related (401, 403, or requires reconnection)
				const isOAuthError = publishResult.error?.includes('REVOKED_ACCESS_TOKEN') ||
					publishResult.error?.includes('401') ||
					publishResult.error?.includes('403') ||
					publishResult.error?.includes('reconnect') ||
					publishResult.error?.includes('expired');

				if (isOAuthError && attempts >= 2) {
					// Mark connection as needing reauth and send email notification
					await markConnectionNeedsReauthAndNotify(
						admin,
						userId,
						connection.connectionId,
						'linkedin',
						publishResult.error || 'LinkedIn connection expired',
						1 // affectedCount
					);
				}

				updateQueue.push({
					id: record.id,
					fields: {
						status: newStatus,
						publish_error: publishResult.error || 'Unknown error',
						publish_attempts: attempts,
					},
				});

				stats.failed++;
				stats.errors.push(`Record ${record.id}: ${publishResult.error}`);
			}
		} catch (error: any) {
			// Handle unexpected errors
			// Use getField helper even in catch block - need to access fields correctly
			const errorFields = record.fields;
			const getErrorField = (fieldName: string, fieldId?: string) => getFieldValue(errorFields, fieldId, fieldName);
			const attempts = (getErrorField('publish_attempts') || 0) + 1;
			const newStatus = attempts >= 3 ? 'Failed' : 'Ready To Publish';

			const errorMessage = error?.message || 'Unexpected error during publishing';
			console.error(`Publishing error for record ${record.id}:`, {
				error: errorMessage,
				errorStack: error?.stack,
				brandProfileId: brandProfileId || 'unknown',
				userId: userId || 'unknown',
				attempts,
			});

			updateQueue.push({
				id: record.id,
				fields: {
					status: newStatus,
					publish_error: errorMessage,
					publish_attempts: attempts,
				},
			});

			stats.failed++;
			stats.errors.push(`Record ${record.id}: ${errorMessage}`);
		}
	}

	// Batch update all queued records (in groups of 10 per Airtable limit)
	if (updateQueue.length > 0) {
		console.log(`[Publish Job] Batching ${updateQueue.length} record updates`);
		try {
			await batchUpdate({
				table: TABLE_ID,
				records: updateQueue,
			});
			console.log(`[Publish Job] Successfully batch updated ${updateQueue.length} records`);
		} catch (batchError: any) {
			console.error(`[Publish Job] Batch update failed:`, batchError);
			stats.errors.push(`Batch update failed: ${batchError.message}`);
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

