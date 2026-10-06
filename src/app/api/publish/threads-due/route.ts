import { NextResponse } from 'next/server';
import { getSupabaseService } from '@/lib/supabaseService';
import { isThreadsPublishingEnabled } from '@/lib/featureFlags';
import { publishThreadsPost } from '@/lib/threads/oauth';
import { getAuthorizationSecrets } from '@/lib/social/authorizationSecrets';
import { applyThreadsJobOutcomeToAgentContent } from '@/lib/publish/agentThreadsJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		if (!isThreadsPublishingEnabled()) {
			return NextResponse.json({ error: 'Threads publishing is disabled' }, { status: 404 });
		}

		const authHeader = request.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;
		if (!cronSecret) {
			return NextResponse.json({ error: 'Worker not configured' }, { status: 500 });
		}
		if (authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const admin = getSupabaseService();
		const now = new Date().toISOString();

		const { data: dueJobs, error: fetchError } = await admin
			.from('publish_jobs')
			.select('*')
			.eq('platform', 'threads')
			.in('status', ['queued', 'retrying'])
			.lte('scheduled_time', now)
			.or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
			.order('scheduled_time', { ascending: true })
			.limit(50);

		if (fetchError) {
			return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
		}

		if (!dueJobs?.length) {
			return NextResponse.json({ ok: true, processed: 0 });
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

				const { text, imageUrl, videoUrl } = payload_json || {};
				const result = await publishThreadsPost({
					threadsUserId: target_id,
					accessToken: secrets.accessToken,
					text: text || '',
					imageUrl: imageUrl || undefined,
					videoUrl: videoUrl || undefined,
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

		return NextResponse.json({ ok: true, results });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Server error';
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
