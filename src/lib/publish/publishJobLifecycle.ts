import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseService } from '@/lib/supabaseService';
import { applyMetaJobOutcomeToAgentContent } from '@/lib/publish/agentMetaJob';
import { applyThreadsJobOutcomeToAgentContent } from '@/lib/publish/agentThreadsJob';

/** Vercel functions can run up to 5 minutes; treat older locks as abandoned. */
export const STALE_PUBLISHING_AFTER_MS = 20 * 60 * 1000;

export function isStalePublishingJob(job: { status: string; updated_at?: string | null }): boolean {
	if (job.status !== 'publishing') return false;
	if (!job.updated_at) return true;
	const ageMs = Date.now() - new Date(job.updated_at).getTime();
	return !Number.isNaN(ageMs) && ageMs > STALE_PUBLISHING_AFTER_MS;
}

export type StalePublishingRecoveryStats = {
	scanned: number;
	recoveredToQueued: number;
	markedPublished: number;
	markedFailed: number;
	skipped: number;
};

type PublishJobRow = {
	id: string;
	platform: string;
	status: string;
	user_id: string;
	content_item_key: string;
	payload_json?: Record<string, unknown>;
	remote_post_id?: string | null;
	attempts?: number | null;
	error_message?: string | null;
	updated_at?: string | null;
};

const MAX_ATTEMPTS = 3;

async function finalizePublishedFromExistingId(admin: SupabaseClient, job: PublishJobRow, remotePostId: string) {
	await admin
		.from('publish_jobs')
		.update({
			status: 'published',
			remote_post_id: remotePostId,
			error_message: null,
			updated_at: new Date().toISOString(),
		})
		.eq('id', job.id);

	if (job.platform === 'threads') {
		await applyThreadsJobOutcomeToAgentContent({
			user_id: job.user_id,
			content_item_key: job.content_item_key,
			payload_json: job.payload_json as { source?: string; memoryId?: string },
			status: 'published',
			remote_post_id: remotePostId,
		});
	} else if (job.platform === 'facebook' || job.platform === 'instagram') {
		await applyMetaJobOutcomeToAgentContent({
			user_id: job.user_id,
			content_item_key: job.content_item_key,
			payload_json: job.payload_json as {
				source?: string;
				memoryId?: string;
				platform?: 'facebook' | 'instagram';
			},
			status: 'published',
			remote_post_id: remotePostId,
		});
	}
}

/**
 * Reset publish_jobs stuck in publishing after a crashed worker run.
 * Idempotent: jobs with remote_post_id are marked published, not re-queued.
 */
export async function recoverStalePublishingJobs(input?: {
	platforms?: readonly string[];
	limit?: number;
	now?: Date;
}): Promise<StalePublishingRecoveryStats> {
	const admin = getSupabaseService();
	const limit = input?.limit ?? 50;
	const staleBefore = new Date((input?.now ?? new Date()).getTime() - STALE_PUBLISHING_AFTER_MS).toISOString();

	let query = admin
		.from('publish_jobs')
		.select('id, platform, status, user_id, content_item_key, payload_json, remote_post_id, attempts, error_message, updated_at')
		.eq('status', 'publishing')
		.lt('updated_at', staleBefore)
		.order('updated_at', { ascending: true })
		.limit(limit);

	if (input?.platforms?.length) {
		query = query.in('platform', [...input.platforms]);
	}

	const { data: rows, error } = await query;
	if (error) {
		throw new Error(`Failed to scan stale publishing jobs: ${error.message}`);
	}

	const stats: StalePublishingRecoveryStats = {
		scanned: 0,
		recoveredToQueued: 0,
		markedPublished: 0,
		markedFailed: 0,
		skipped: 0,
	};

	for (const row of rows ?? []) {
		stats.scanned += 1;
		const job = row as PublishJobRow;

		if (job.remote_post_id?.trim()) {
			await finalizePublishedFromExistingId(admin, job, job.remote_post_id.trim());
			stats.markedPublished += 1;
			continue;
		}

		const attempts = job.attempts ?? 0;
		if (attempts >= MAX_ATTEMPTS) {
			const errorMessage = job.error_message?.trim() || 'Publish worker stopped before completion';
			await admin
				.from('publish_jobs')
				.update({
					status: 'failed',
					error_message: errorMessage,
					updated_at: new Date().toISOString(),
				})
				.eq('id', job.id);

			if (job.platform === 'threads') {
				await applyThreadsJobOutcomeToAgentContent({
					user_id: job.user_id,
					content_item_key: job.content_item_key,
					payload_json: job.payload_json as { source?: string; memoryId?: string },
					status: 'failed',
					error_message: errorMessage,
				});
			} else if (job.platform === 'facebook' || job.platform === 'instagram') {
				await applyMetaJobOutcomeToAgentContent({
					user_id: job.user_id,
					content_item_key: job.content_item_key,
					payload_json: job.payload_json as {
						source?: string;
						memoryId?: string;
						platform?: 'facebook' | 'instagram';
					},
					status: 'failed',
					error_message: errorMessage,
				});
			}
			stats.markedFailed += 1;
			continue;
		}

		const { data: unlocked, error: unlockError } = await admin
			.from('publish_jobs')
			.update({
				status: 'queued',
				next_attempt_at: null,
				error_message: job.error_message?.trim() || 'Recovered after interrupted publish attempt',
				updated_at: new Date().toISOString(),
			})
			.eq('id', job.id)
			.eq('status', 'publishing')
			.select('id')
			.maybeSingle();

		if (unlockError || !unlocked) {
			stats.skipped += 1;
			continue;
		}
		stats.recoveredToQueued += 1;
	}

	return stats;
}

export async function countStalePublishingJobs(platforms?: readonly string[]): Promise<number> {
	const admin = getSupabaseService();
	const staleBefore = new Date(Date.now() - STALE_PUBLISHING_AFTER_MS).toISOString();
	let query = admin.from('publish_jobs').select('id', { count: 'exact', head: true }).eq('status', 'publishing').lt('updated_at', staleBefore);
	if (platforms?.length) query = query.in('platform', [...platforms]);
	const { count, error } = await query;
	if (error) return 0;
	return count ?? 0;
}
