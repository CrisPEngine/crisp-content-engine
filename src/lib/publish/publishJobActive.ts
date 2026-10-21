import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import type { AgentMetaPlatform } from '@/lib/publish/agentMetaJob';
import { isStalePublishingJob } from '@/lib/publish/publishJobLifecycle';
import { publishInstantsMatch } from '@/lib/publish/publishInstant';

export type PublishJobRow = {
	id: string;
	user_id: string;
	platform: string;
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	content_item_key: string;
};

/** Jobs the worker can pick up soon: queued/retrying only (not in-flight publishing). */
export function isQueueablePublishJobStatus(status: string): boolean {
	return status === 'queued' || status === 'retrying';
}

export async function findPublishJobForContent(input: {
	contentItemKey: string;
	platform: string;
	userId?: string;
}): Promise<PublishJobRow | null> {
	const admin = getSupabaseService();
	let query = admin
		.from('publish_jobs')
		.select('id, user_id, platform, status, scheduled_time, next_attempt_at, content_item_key')
		.eq('platform', input.platform)
		.eq('content_item_key', input.contentItemKey);

	if (input.userId) {
		query = query.eq('user_id', input.userId);
	}

	const { data, error } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
	if (error || !data) return null;
	return data as PublishJobRow;
}

/** Find job for content regardless of owning user (legacy rows). */
export async function findPublishJobForContentAnyUser(input: {
	contentItemKey: string;
	platform: string;
}): Promise<PublishJobRow | null> {
	return findPublishJobForContent({ ...input, userId: undefined });
}

export function publishJobMatchesPublishAt(job: PublishJobRow, publishAt: string | undefined, toleranceMs = 2_000): boolean {
	if (!publishAt?.trim()) return true;
	return publishInstantsMatch(publishAt, job.scheduled_time, toleranceMs);
}

export function isPublishJobDue(job: PublishJobRow, now: Date = new Date()): boolean {
	if (!isQueueablePublishJobStatus(job.status)) return false;
	const nowIso = now.toISOString();
	if (job.scheduled_time > nowIso) return false;
	if (job.next_attempt_at && job.next_attempt_at > nowIso) return false;
	return true;
}

/**
 * True when this content has a queueable publish_jobs row for the owner that matches the intended slot.
 */
/** Remove stale queue rows so sync can insert a fresh queued job (any owner). */
export async function clearNonTerminalPublishJobsForContent(input: {
	platform: string;
	contentItemKey: string;
}): Promise<void> {
	const admin = getSupabaseService();
	const { error } = await admin
		.from('publish_jobs')
		.delete()
		.eq('platform', input.platform)
		.eq('content_item_key', input.contentItemKey)
		.in('status', ['queued', 'retrying', 'publishing', 'failed']);
	if (error) {
		throw new Error(`Failed to clear publish jobs for ${input.contentItemKey}: ${error.message}`);
	}
}

export async function hasActiveQueueablePublishJob(input: {
	userId: string;
	contentItemKey: string;
	platform: AgentMetaPlatform | 'threads';
	publishAt?: string;
}): Promise<{ active: boolean; reason?: string; job?: PublishJobRow }> {
	const job = await findPublishJobForContent({
		userId: input.userId,
		contentItemKey: input.contentItemKey,
		platform: input.platform,
	});
	if (!job) {
		const orphan = await findPublishJobForContentAnyUser({
			contentItemKey: input.contentItemKey,
			platform: input.platform,
		});
		if (orphan && orphan.user_id !== input.userId) {
			return { active: false, reason: 'publish_job_wrong_owner', job: orphan };
		}
		return { active: false, reason: 'no_publish_job' };
	}
	if (!isQueueablePublishJobStatus(job.status)) {
		if (job.status === 'publishing' && isStalePublishingJob(job)) {
			return { active: false, reason: 'stale_publishing', job };
		}
		return { active: false, reason: `status_${job.status}`, job };
	}
	if (!publishJobMatchesPublishAt(job, input.publishAt)) {
		return { active: false, reason: 'scheduled_time_mismatch', job };
	}
	return { active: true, job };
}
