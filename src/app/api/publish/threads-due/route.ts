import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isThreadsPublishingEnabled } from '@/lib/featureFlags';
import { publishThreadsPost } from '@/lib/threads/oauth';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { applyThreadsJobOutcomeToAgentContent } from '@/lib/publish/agentThreadsJob';
import { duePublishJobsQuery } from '@/lib/publish/dueJobsQuery';
import { requirePublishCronAuth } from '@/lib/publish/cronAuth';
import { recoverStalePublishingJobs } from '@/lib/publish/publishJobLifecycle';
import { reconcileScheduledNativePublishJobs } from '@/lib/publish/reconcileScheduledPublish';
import { recordPublishWorkerRun } from '@/lib/publish/workerHeartbeat';
import { getIntelligenceStore } from '@/lib/intelligence/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Threads publish worker (publish_jobs). Scheduled via cron-job.org (not Vercel Cron).
 * Security: Authorization: Bearer {CRON_SECRET}
 */
export async function GET(request: Request) {
	let processed = 0;
	try {
		if (!isThreadsPublishingEnabled()) {
			return NextResponse.json({ error: 'Threads publishing is disabled' }, { status: 404 });
		}

		const auth = requirePublishCronAuth(request);
		if (!auth.ok) {
			return NextResponse.json({ error: auth.error }, { status: auth.status });
		}

		const admin = getSupabaseService();
		const now = new Date().toISOString();

		const staleRecovery = await recoverStalePublishingJobs({ platforms: ['threads'] });
		const reconcile = await reconcileScheduledNativePublishJobs({ now: new Date(now) });

		const { data: dueJobs, error: fetchError } = await duePublishJobsQuery(admin, {
			platforms: ['threads'],
			now,
		});

		if (fetchError) {
			return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
		}

		if (!dueJobs?.length) {
			await recordPublishWorkerRun({ worker: 'threads-due', ok: true, processed: 0 });
			return NextResponse.json({ ok: true, processed: 0, staleRecovery, reconcile });
		}

		const results = { processed: 0, published: 0, retrying: 0, failed: 0, skipped: 0 };
		const MAX_ATTEMPTS = 3;
		const RETRY_DELAYS = [5 * 60, 15 * 60, 60 * 60];

		for (const job of dueJobs) {
			results.processed++;
			const { data: locked } = await admin
				.from('publish_jobs')
				.update({ status: 'publishing', updated_at: new Date().toISOString() })
				.eq('id', job.id)
				.in('status', ['queued', 'retrying'])
				.select('id')
				.maybeSingle();

			if (!locked) {
				results.skipped++;
				continue;
			}

			try {
				const { target_id, payload_json, user_id } = job;

				if (typeof job.remote_post_id === 'string' && job.remote_post_id.trim()) {
					await admin
						.from('publish_jobs')
						.update({
							status: 'published',
							error_message: null,
							updated_at: new Date().toISOString(),
						})
						.eq('id', job.id);
					await applyThreadsJobOutcomeToAgentContent({
						user_id: job.user_id,
						content_item_key: job.content_item_key,
						payload_json: job.payload_json,
						status: 'published',
						remote_post_id: job.remote_post_id.trim(),
					});
					results.published++;
					continue;
				}

				const payload = payload_json as { source?: string; memoryId?: string } | undefined;
				if (payload?.source === 'agent') {
					const memoryId = payload.memoryId || job.content_item_key;
					const memory = await getIntelligenceStore().getMemory(user_id, memoryId);
					const externalId = memory?.externalPostId?.trim();
					if (externalId) {
						await admin
							.from('publish_jobs')
							.update({
								status: 'published',
								remote_post_id: externalId,
								error_message: null,
								updated_at: new Date().toISOString(),
							})
							.eq('id', job.id);
						await applyThreadsJobOutcomeToAgentContent({
							user_id: job.user_id,
							content_item_key: job.content_item_key,
							payload_json: job.payload_json,
							status: 'published',
							remote_post_id: externalId,
						});
						results.published++;
						continue;
					}
				}

				const { data: dest } = await admin
					.from('social_destinations')
					.select('authorization_id')
					.eq('provider_destination_id', target_id)
					.eq('provider', 'threads')
					.maybeSingle();

				if (!dest?.authorization_id) {
					throw new Error('Threads destination not found');
				}

				const secrets = await getAuthorizationSecrets(dest.authorization_id);
				if (!secrets?.accessToken) {
					throw new Error('Threads token missing');
				}

				const { text, imageUrl, videoUrl, replyToId } = payload_json || {};
				const result = await publishThreadsPost({
					threadsUserId: target_id,
					accessToken: secrets.accessToken,
					text: text || '',
					imageUrl: imageUrl || undefined,
					videoUrl: videoUrl || undefined,
					replyToId: typeof replyToId === 'string' ? replyToId : undefined,
				});

				if (!result.success) {
					throw new Error(result.error || 'Threads publish failed');
				}

				await admin
					.from('publish_jobs')
					.update({
						status: 'published',
						remote_post_id: result.postId || null,
						error_message: null,
						updated_at: new Date().toISOString(),
					})
					.eq('id', job.id);

				await applyThreadsJobOutcomeToAgentContent({
					user_id: job.user_id,
					content_item_key: job.content_item_key,
					payload_json: job.payload_json,
					status: 'published',
					remote_post_id: result.postId || null,
				});

				results.published++;
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Unknown error';
				const attempts = (job.attempts || 0) + 1;
				if (attempts < MAX_ATTEMPTS) {
					const delaySeconds = RETRY_DELAYS[attempts - 1] || 60 * 60;
					const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
					await admin
						.from('publish_jobs')
						.update({
							status: 'retrying',
							error_message: message,
							attempts,
							next_attempt_at: nextAttemptAt,
							updated_at: new Date().toISOString(),
						})
						.eq('id', job.id);
					results.retrying++;
				} else {
					await admin
						.from('publish_jobs')
						.update({
							status: 'failed',
							error_message: message,
							attempts,
							updated_at: new Date().toISOString(),
						})
						.eq('id', job.id);
					await applyThreadsJobOutcomeToAgentContent({
						user_id: job.user_id,
						content_item_key: job.content_item_key,
						payload_json: job.payload_json,
						status: 'failed',
						error_message: message,
					});
					results.failed++;
				}
			}
		}

		processed = results.processed;
		await recordPublishWorkerRun({ worker: 'threads-due', ok: true, processed: results.processed });
		return NextResponse.json({ ok: true, staleRecovery, reconcile, results });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Server error';
		await recordPublishWorkerRun({ worker: 'threads-due', ok: false, processed, error: message });
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

export async function POST(request: Request) {
	return GET(request);
}
