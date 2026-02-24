import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isMetaPublishingEnabled } from '@/lib/featureFlags';
import { publishToFacebookPage, publishToInstagram, decryptMetaToken, type MetaGraphErrorDetail } from '@/lib/meta/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta Publish Worker
 * Cron endpoint: Process due Meta publish jobs
 * 
 * Guarded by:
 * - META_PUBLISHING_ENABLED feature flag
 * - Authorization: Bearer {CRON_SECRET}
 * 
 * Scheduling strategy:
 * - Cron handles ALL timing. We always do immediate publishes.
 * - No Facebook scheduled_publish_time (avoids 10min minimum conflict).
 * - 60-second spacing is enforced at job-creation time.
 * 
 * Flow:
 * 1. Fetch due jobs (status IN ('queued','retrying'), scheduled_time <= now,
 *    next_attempt_at IS NULL OR next_attempt_at <= now)
 * 2. For each job:
 *    - Optimistic lock: UPDATE ... WHERE status IN ('queued','retrying')
 *    - If lock fails (0 rows), skip (another worker got it)
 *    - Publish using payload_json (never re-read Airtable)
 * 3. On success: status=published, remote_post_id, update Airtable
 * 4. On failure: retry with exponential backoff, or mark failed permanently
 */
export async function GET(request: Request) {
	try {
		// Feature flag guard
		if (!isMetaPublishingEnabled()) {
			return NextResponse.json({ error: 'Meta publishing is disabled' }, { status: 404 });
		}

		// Cron secret guard
		const authHeader = request.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error('[Meta Worker] CRON_SECRET not configured');
			return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
		}

		if (authHeader !== `Bearer ${cronSecret}`) {
			console.error('[Meta Worker] Unauthorized: Invalid cron secret');
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const now = new Date().toISOString();

		// Fetch due jobs: queued OR retrying, scheduled_time <= now,
		// and next_attempt_at is null or in the past
		const { data: dueJobs, error: fetchError } = await admin
			.from('publish_jobs')
			.select('*')
			.in('status', ['queued', 'retrying'])
			.lte('scheduled_time', now)
			.or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
			.order('scheduled_time', { ascending: true })
			.limit(50);

		if (fetchError) {
			console.error('[Meta Worker] Error fetching jobs:', fetchError);
			return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
		}

		if (!dueJobs || dueJobs.length === 0) {
			return NextResponse.json({ ok: true, processed: 0 });
		}

		console.log(`[Meta Worker] Processing ${dueJobs.length} due jobs`);

		const results = {
			processed: 0,
			published: 0,
			retrying: 0,
			failed: 0,
			skipped: 0,
		};

		for (const job of dueJobs) {
			results.processed++;

			try {
				// Optimistic lock: atomically claim the job
				// Only succeeds if status is still queued or retrying
				const { data: locked, error: lockError } = await admin
					.from('publish_jobs')
					.update({ status: 'publishing', updated_at: new Date().toISOString() })
					.eq('id', job.id)
					.in('status', ['queued', 'retrying'])
					.select('id')
					.maybeSingle();

				if (lockError || !locked) {
					// Another worker already claimed this job, skip
					console.log(`[Meta Worker] Job ${job.id} already claimed, skipping`);
					results.skipped++;
					continue;
				}

				const result = await publishJob(job, admin);

				if (result.success) {
					results.published++;
				} else if (result.retry) {
					results.retrying++;
				} else {
					results.failed++;
				}
			} catch (jobError: any) {
				console.error(`[Meta Worker] Job ${job.id} unexpected error:`, jobError);
				results.failed++;

				// Mark as failed with error
				await admin
					.from('publish_jobs')
					.update({
						status: 'failed',
						error_message: jobError.message || 'Unknown error',
						updated_at: new Date().toISOString(),
					})
					.eq('id', job.id);

				// Also update Airtable with failure status
				await updateAirtableFailed(job.airtable_record_id, jobError.message || 'Unknown error');
			}
		}

		console.log('[Meta Worker] Processing complete:', results);
		return NextResponse.json({ ok: true, results });
	} catch (error: any) {
		console.error('[Meta Worker] Critical error:', error);
		return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
	}
}

/**
 * Publish a single job.
 * Called after optimistic lock has already set status='publishing'.
 * Returns result with optional metaError for failure logging (response_status, graph_error_code).
 */
async function publishJob(
	job: any,
	admin: any
): Promise<{ success: boolean; retry: boolean; error?: string; metaError?: MetaGraphErrorDetail }> {
	const MAX_ATTEMPTS = 3;
	const RETRY_DELAYS = [5 * 60, 15 * 60, 60 * 60]; // 5min, 15min, 1hr

	function buildUpdatePayload(
		status: string,
		errorMessage: string,
		attempts: number,
		nextAttemptAt?: string | null,
		metaError?: MetaGraphErrorDetail
	) {
		const payload: Record<string, unknown> = {
			status,
			error_message: errorMessage,
			attempts,
			updated_at: new Date().toISOString(),
		};
		if (nextAttemptAt != null) payload.next_attempt_at = nextAttemptAt;
		if (metaError) {
			payload.response_status = metaError.responseStatus;
			const parts = [metaError.graphCode, metaError.graphSubcode].filter((x) => x != null);
			payload.graph_error_code = parts.length ? parts.join(',') : null;
		}
		return payload;
	}

	try {
		const { platform, target_id, payload_json, user_id } = job;

		// Get access token
		let accessToken: string | null = null;

		if (platform === 'facebook') {
			const { data: page } = await admin
				.from('meta_pages')
				.select('page_access_token_encrypted')
				.eq('user_id', user_id)
				.eq('page_id', target_id)
				.maybeSingle();

			if (!page || !page.page_access_token_encrypted) {
				throw new Error('Page access token not found. User may need to reconnect.');
			}

			accessToken = decryptMetaToken(page.page_access_token_encrypted);
		} else if (platform === 'instagram') {
			const { data: igAccount } = await admin
				.from('meta_instagram_accounts')
				.select('connected_page_id')
				.eq('user_id', user_id)
				.eq('ig_user_id', target_id)
				.maybeSingle();

			if (!igAccount) {
				throw new Error('Instagram account not found. User may need to reconnect.');
			}

			const { data: page } = await admin
				.from('meta_pages')
				.select('page_access_token_encrypted')
				.eq('user_id', user_id)
				.eq('page_id', igAccount.connected_page_id)
				.maybeSingle();

			if (!page || !page.page_access_token_encrypted) {
				throw new Error('Connected page access token not found. User may need to reconnect.');
			}

			accessToken = decryptMetaToken(page.page_access_token_encrypted);
		}

		if (!accessToken) {
			throw new Error('Access token not found');
		}

		// Publish using payload_json (source of truth, never re-read Airtable)
		const { text, imageUrl } = payload_json;
		let remotePostId: string;

		if (platform === 'facebook') {
			const result = await publishToFacebookPage(target_id, accessToken, {
				message: text,
				imageUrl: imageUrl || undefined,
				scheduledTime: undefined,
			});

			if (!result.success) {
				const errorMessage = result.error || 'Facebook publish failed';
				const attempts = (job.attempts || 0) + 1;
				if (attempts < MAX_ATTEMPTS) {
					const delaySeconds = RETRY_DELAYS[attempts - 1] || 60 * 60;
					const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
					await admin
						.from('publish_jobs')
						.update(buildUpdatePayload('retrying', errorMessage, attempts, nextAttemptAt, result.metaError))
						.eq('id', job.id);
					console.log(`[Meta Worker] Job ${job.id} retry ${attempts}/${MAX_ATTEMPTS} at ${nextAttemptAt}`);
					return { success: false, retry: true, error: errorMessage, metaError: result.metaError };
				} else {
					await admin
						.from('publish_jobs')
						.update(buildUpdatePayload('failed', errorMessage, attempts, null, result.metaError))
						.eq('id', job.id);
					await updateAirtableFailed(job.airtable_record_id, errorMessage);
					console.log(`[Meta Worker] Job ${job.id} permanently failed after ${attempts} attempts`);
					return { success: false, retry: false, error: errorMessage, metaError: result.metaError };
				}
			}
			remotePostId = result.postId || '';
		} else if (platform === 'instagram') {
			if (!imageUrl) {
				throw new Error('Instagram requires an image');
			}

			const result = await publishToInstagram(target_id, accessToken, {
				imageUrl,
				caption: text,
			});

			if (!result.success) {
				const errorMessage = result.error || 'Instagram publish failed';
				const attempts = (job.attempts || 0) + 1;
				if (attempts < MAX_ATTEMPTS) {
					const delaySeconds = RETRY_DELAYS[attempts - 1] || 60 * 60;
					const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
					await admin
						.from('publish_jobs')
						.update(buildUpdatePayload('retrying', errorMessage, attempts, nextAttemptAt, result.metaError))
						.eq('id', job.id);
					console.log(`[Meta Worker] Job ${job.id} retry ${attempts}/${MAX_ATTEMPTS} at ${nextAttemptAt}`);
					return { success: false, retry: true, error: errorMessage, metaError: result.metaError };
				} else {
					await admin
						.from('publish_jobs')
						.update(buildUpdatePayload('failed', errorMessage, attempts, null, result.metaError))
						.eq('id', job.id);
					await updateAirtableFailed(job.airtable_record_id, errorMessage);
					console.log(`[Meta Worker] Job ${job.id} permanently failed after ${attempts} attempts`);
					return { success: false, retry: false, error: errorMessage, metaError: result.metaError };
				}
			}
			remotePostId = result.postId || '';
		} else {
			throw new Error(`Unsupported platform: ${platform}`);
		}

		// Success: update job (no change to success path)
		await admin
			.from('publish_jobs')
			.update({
				status: 'published',
				remote_post_id: remotePostId,
				error_message: null,
				updated_at: new Date().toISOString(),
			})
			.eq('id', job.id);

		await updateAirtablePublished(job.airtable_record_id, remotePostId, platform);
		console.log(`[Meta Worker] Job ${job.id} published: ${remotePostId}`);
		return { success: true, retry: false };
	} catch (error: any) {
		console.error(`[Meta Worker] Job ${job.id} publish failed:`, error);

		const attempts = (job.attempts || 0) + 1;
		const errorMessage = error.message || 'Unknown error';

		if (attempts < MAX_ATTEMPTS) {
			const delaySeconds = RETRY_DELAYS[attempts - 1] || 60 * 60;
			const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
			await admin
				.from('publish_jobs')
				.update(buildUpdatePayload('retrying', errorMessage, attempts, nextAttemptAt))
				.eq('id', job.id);
			console.log(`[Meta Worker] Job ${job.id} retry ${attempts}/${MAX_ATTEMPTS} at ${nextAttemptAt}`);
			return { success: false, retry: true, error: errorMessage };
		} else {
			await admin
				.from('publish_jobs')
				.update(buildUpdatePayload('failed', errorMessage, attempts, null))
				.eq('id', job.id);
			await updateAirtableFailed(job.airtable_record_id, errorMessage);
			console.log(`[Meta Worker] Job ${job.id} permanently failed after ${attempts} attempts`);
			return { success: false, retry: false, error: errorMessage };
		}
	}
}

/**
 * Update Airtable record on successful publish
 */
async function updateAirtablePublished(
	recordId: string,
	remotePostId: string,
	platform: string
): Promise<void> {
	if (!recordId) return;

	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

	if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
		console.error('[Meta Worker] Airtable config missing, skipping update');
		return;
	}

	try {
		// Construct published_url (best effort)
		let publishedUrl = '';
		if (platform === 'facebook' && remotePostId) {
			const parts = remotePostId.split('_');
			if (parts.length === 2) {
				publishedUrl = `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
			}
		}
		// Instagram: media ID cannot be converted to URL without another API call

		const updateFields: Record<string, any> = {
			status: 'Published',
			published_at: new Date().toISOString(),
		};

		if (publishedUrl) {
			updateFields.published_url = publishedUrl;
		}

		const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fields: updateFields }),
		});

		if (!response.ok) {
			const result = await response.json();
			console.error('[Meta Worker] Airtable publish update failed:', result);
		}
	} catch (error) {
		console.error('[Meta Worker] Airtable publish update error:', error);
	}
}

/**
 * Update Airtable record on permanent failure.
 * Sets status to 'Failed' and includes publish_error message.
 */
async function updateAirtableFailed(recordId: string, errorMessage: string): Promise<void> {
	if (!recordId) return;

	const AIRTABLE_TOKEN = process.env.AIRTABLE_PAT;
	const BASE_ID = process.env.AIRTABLE_BASE_ID;
	const TABLE_ID = process.env.AIRTABLE_CONTENTQUEUE_TABLE;

	if (!AIRTABLE_TOKEN || !BASE_ID || !TABLE_ID) {
		console.error('[Meta Worker] Airtable config missing, skipping update');
		return;
	}

	try {
		const updateFields: Record<string, any> = {
			status: 'Failed',
			publish_error: errorMessage,
		};

		const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}/${recordId}`, {
			method: 'PATCH',
			headers: {
				Authorization: `Bearer ${AIRTABLE_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ fields: updateFields }),
		});

		if (!response.ok) {
			const result = await response.json();
			console.error('[Meta Worker] Airtable failure update failed:', result);
		}
	} catch (error) {
		console.error('[Meta Worker] Airtable failure update error:', error);
	}
}
