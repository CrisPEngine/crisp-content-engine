/**
 * Retry Failed Posts After Reconnection
 * 
 * When a LinkedIn connection is reconnected (needs_reauth cleared),
 * this function finds posts that failed due to auth issues and resets
 * them to "Ready To Publish" so they can be retried on the next cron job.
 */

interface RetryFailedPostsParams {
	connectionId: string;
	brandProfileIds: string[]; // Array of brand_profile_ids that use this connection
	userId?: string; // Optional user_id to query posts if brand_profile_ids are empty
}

/**
 * Retry posts that failed due to auth issues for a given connection
 * Returns the number of posts reset
 */
export async function retryFailedPostsAfterReconnection(
	params: RetryFailedPostsParams
): Promise<{ reset: number; errors: string[] }> {
	const { connectionId, brandProfileIds, userId } = params;

	// If no brand profiles, try to query by user_id if provided
	if (brandProfileIds.length === 0) {
		if (!userId) {
			console.log(`[Retry Failed Posts] No brand profiles and no user_id for connection ${connectionId}, skipping`);
			return { reset: 0, errors: [] };
		}
		console.log(`[Retry Failed Posts] No brand profiles for connection ${connectionId}, will query by user_id: ${userId}`);
	}

	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

	if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
		console.warn('[Retry Failed Posts] Airtable configuration missing, skipping');
		return { reset: 0, errors: ['Airtable configuration missing'] };
	}

	const errors: string[] = [];
	let resetCount = 0;

	// Auth-related error keywords to match
	const authErrorKeywords = [
		'reconnect',
		'expired',
		'401',
		'403',
		'REVOKED_ACCESS_TOKEN',
		'connection expired',
		'LinkedIn connection',
		'token',
		'token refresh failed',
		'invalid_grant',
		'refresh failed',
		'authentication',
		'authorization',
		'oauth',
	];

	// Build filter to find posts that:
	// 1. Are for LinkedIn platform
	// 2. Belong to one of the brand profiles using this connection (or user_id if no brands)
	// 3. Have status "Failed" OR (status "Ready To Publish" AND publish_attempts >= 3)
	// 4. Have an error message indicating auth issues (filtered in code)
	
	let filterFormula: string;
	
	if (brandProfileIds.length > 0) {
		// Query by brand_profile_ids
		const brandProfileFilters = brandProfileIds
			.map((id) => `{brand_profile_id} = "${id}"`)
			.join(',');
		
		filterFormula = `AND(
			{platform} = "LinkedIn",
			OR(${brandProfileFilters}),
			OR(
				{status} = "Failed",
				AND({status} = "Ready To Publish", OR({publish_attempts} >= 3, {publish_attempts} = BLANK()))
			)
		)`;
	} else if (userId) {
		// Fallback: query by user_id if no brand_profile_ids
		filterFormula = `AND(
			{platform} = "LinkedIn",
			{user_id} = "${userId}",
			OR(
				{status} = "Failed",
				AND({status} = "Ready To Publish", OR({publish_attempts} >= 3, {publish_attempts} = BLANK()))
			)
		)`;
	} else {
		// No way to query - should have been caught earlier
		return { reset: 0, errors: ['No brand_profile_ids or user_id provided'] };
	}

	// Fetch matching records
	const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`);
	url.searchParams.set('filterByFormula', filterFormula);
	url.searchParams.set('maxRecords', '100'); // Limit to 100 at a time

	const fields = ['status', 'publish_error', 'publish_attempts', 'brand_profile_id', 'platform'];
	fields.forEach((field) => {
		url.searchParams.append('fields[]', field);
	});

	try {
		const response = await fetch(url.toString(), {
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			const errorText = await response.text();
			const error = `Failed to fetch posts: ${errorText}`;
			console.error(`[Retry Failed Posts] ${error}`);
			return { reset: 0, errors: [error] };
		}

		const data = await response.json();
		const records = data.records || [];

		console.log(`[Retry Failed Posts] Found ${records.length} potential posts to retry for connection ${connectionId}`);

		// Filter records to only include those with auth-related errors
		const authFailedRecords = records.filter((record: any) => {
			const errorMessage = (record.fields?.publish_error || '').toLowerCase();
			const hasAuthError = authErrorKeywords.some((keyword) =>
				errorMessage.includes(keyword.toLowerCase())
			);

			// Also include records with status "Failed" even if no error message
			// (they might have failed due to auth but error wasn't captured)
			const isFailed = record.fields?.status === 'Failed';

			return hasAuthError || isFailed;
		});

		console.log(
			`[Retry Failed Posts] ${authFailedRecords.length} posts have auth-related errors for connection ${connectionId}`
		);

		// Reset each post to "Ready To Publish"
		for (const record of authFailedRecords) {
			try {
				const updateResponse = await fetch(
					`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${record.id}`,
					{
						method: 'PATCH',
						headers: {
							Authorization: `Bearer ${AIRTABLE_TOKEN}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							fields: {
								status: 'Ready To Publish',
								publish_error: '', // Clear error message
								publish_attempts: 0, // Reset attempts since auth was reinstated
								// This gives the post a fresh chance to publish on the next cron job
							},
						}),
					}
				);

				if (!updateResponse.ok) {
					const errorText = await updateResponse.text();
					const error = `Failed to reset record ${record.id}: ${errorText}`;
					console.error(`[Retry Failed Posts] ${error}`);
					errors.push(error);
				} else {
					resetCount++;
					console.log(
						`[Retry Failed Posts] Reset record ${record.id} to "Ready To Publish" for connection ${connectionId}`
					);
				}
			} catch (error: any) {
				const errorMsg = `Error resetting record ${record.id}: ${error?.message || 'Unknown error'}`;
				console.error(`[Retry Failed Posts] ${errorMsg}`);
				errors.push(errorMsg);
			}
		}

		console.log(
			`[Retry Failed Posts] Reset ${resetCount} posts for connection ${connectionId} (${errors.length} errors)`
		);

		return { reset: resetCount, errors };
	} catch (error: any) {
		const errorMsg = `Failed to retry failed posts: ${error?.message || 'Unknown error'}`;
		console.error(`[Retry Failed Posts] ${errorMsg}`);
		return { reset: 0, errors: [errorMsg] };
	}
}
