import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { AgentError } from '@/lib/agent/errors';
import {
	agentMetaPlatformFromChannel,
	isAgentMetaMemory,
	repairAgentMetaPublishJobIfMissing,
} from '@/lib/publish/agentMetaJob';
import { isAgentThreadsMemory, syncAgentThreadsPublishJob } from '@/lib/publish/agentThreadsJob';
import { isStalePublishingJob } from '@/lib/publish/publishJobLifecycle';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';

export type ReconcileScheduledPublishStats = {
	scanned: number;
	repaired: number;
	failed: number;
	skipped: number;
};

const NATIVE_PUBLISH_CHANNELS = ['instagram', 'facebook', 'threads'] as const;

/** Look ahead so missing jobs are created before the slot, not only after overdue. */
export const RECONCILE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

async function jobIsArmedForMemory(userId: string, memory: ContentMemoryRecord): Promise<boolean> {
	if (isAgentThreadsMemory(memory)) {
		return agentThreadsJobIsArmedWithStaleCheck(userId, memory.id);
	}
	const platform = agentMetaPlatformFromChannel(String(memory.channel));
	if (platform && isAgentMetaMemory(memory)) {
		return agentMetaJobIsArmedWithStaleCheck(userId, memory.id, platform);
	}
	return false;
}

async function agentMetaJobIsArmedWithStaleCheck(
	userId: string,
	memoryId: string,
	platform: NonNullable<ReturnType<typeof agentMetaPlatformFromChannel>>,
): Promise<boolean> {
	const admin = getSupabaseService();
	const { data: job } = await admin
		.from('publish_jobs')
		.select('status, updated_at')
		.eq('user_id', userId)
		.eq('platform', platform)
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying', 'publishing'])
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!job) return false;
	if (job.status === 'publishing' && isStalePublishingJob(job)) return false;
	return true;
}

async function agentThreadsJobIsArmedWithStaleCheck(userId: string, memoryId: string): Promise<boolean> {
	const admin = getSupabaseService();
	const { data: job } = await admin
		.from('publish_jobs')
		.select('status, updated_at')
		.eq('user_id', userId)
		.eq('platform', 'threads')
		.eq('content_item_key', memoryId)
		.in('status', ['queued', 'retrying', 'publishing'])
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (!job) return false;
	if (job.status === 'publishing' && isStalePublishingJob(job)) return false;
	return Boolean(job);
}

async function repairThreadsIfMissing(input: {
	userId: string;
	memory: ContentMemoryRecord;
	publishAt?: string;
	recordFailure: boolean;
}): Promise<{ repaired: boolean; error?: string }> {
	if (!isAgentThreadsMemory(input.memory) || input.memory.publicationStatus !== 'scheduled') {
		return { repaired: false };
	}
	const armed = await agentThreadsJobIsArmedWithStaleCheck(input.userId, input.memory.id);
	if (armed) return { repaired: false };
	try {
		await syncAgentThreadsPublishJob({
			userId: input.userId,
			memory: input.memory,
			publishAt: input.publishAt,
		});
		return { repaired: true };
	} catch (error: unknown) {
		const message =
			error instanceof AgentError
				? error.message
				: error instanceof Error
					? error.message
					: 'Threads publish queue sync failed';
		if (input.recordFailure) {
			const store = getIntelligenceStore();
			await store.saveMemory(input.userId, {
				...input.memory,
				publicationStatus: 'failed',
				metadata: {
					...(input.memory.metadata ?? {}),
					lastPublishError: message,
					scheduleRepairFailedAt: new Date().toISOString(),
				},
			});
		}
		return { repaired: false, error: message };
	}
}

/**
 * Ensure native scheduled Meta/Threads content has a live publish_jobs row.
 * Overdue rows record failure when a job cannot be created; future slots are repaired silently.
 */
export async function reconcileScheduledNativePublishJobs(input?: {
	userId?: string;
	now?: Date;
	limit?: number;
}): Promise<ReconcileScheduledPublishStats> {
	const admin = getSupabaseService();
	const now = input?.now ?? new Date();
	const limit = input?.limit ?? 100;
	const lookaheadEnd = new Date(now.getTime() + RECONCILE_LOOKAHEAD_MS).toISOString();

	let query = admin
		.from('content_memory')
		.select('id, user_id, channel, publication_status, publication_date, brand_brain_id')
		.eq('publication_status', 'scheduled')
		.in('channel', [...NATIVE_PUBLISH_CHANNELS])
		.not('publication_date', 'is', null)
		.lte('publication_date', lookaheadEnd)
		.order('publication_date', { ascending: true })
		.limit(limit);

	if (input?.userId) query = query.eq('user_id', input.userId);

	const { data: rows, error } = await query;
	if (error) {
		throw new AgentError('publish_queue_failed', `Failed to scan scheduled native content: ${error.message}`, 502);
	}

	const store = getIntelligenceStore();
	const stats: ReconcileScheduledPublishStats = { scanned: 0, repaired: 0, failed: 0, skipped: 0 };

	for (const row of rows ?? []) {
		stats.scanned += 1;
		const memory = await store.getMemory(row.user_id, row.id);
		if (!memory || memory.publicationStatus !== 'scheduled') {
			stats.skipped += 1;
			continue;
		}

		const publishAt = memory.publicationDate ?? row.publication_date ?? undefined;
		const overdue =
			publishAt && !Number.isNaN(new Date(publishAt).getTime()) && new Date(publishAt).getTime() < now.getTime();

		const armed = await jobIsArmedForMemory(row.user_id, memory);
		if (armed) {
			stats.skipped += 1;
			continue;
		}

		if (isAgentThreadsMemory(memory)) {
			const outcome = await repairThreadsIfMissing({
				userId: row.user_id,
				memory,
				publishAt,
				recordFailure: Boolean(overdue),
			});
			if (outcome.repaired) stats.repaired += 1;
			else if (outcome.error) stats.failed += 1;
			else stats.skipped += 1;
			continue;
		}

		if (isAgentMetaMemory(memory)) {
			const outcome = await repairAgentMetaPublishJobIfMissing({
				userId: row.user_id,
				memory,
				publishAt,
				recordFailure: Boolean(overdue),
			});
			if (outcome.repaired) stats.repaired += 1;
			else if (outcome.error) stats.failed += 1;
			else stats.skipped += 1;
			continue;
		}

		stats.skipped += 1;
	}

	return stats;
}

export type ScheduledPublishHealthIssue = {
	kind: 'overdue_without_job' | 'stale_publishing' | 'cron_stale';
	message: string;
	count?: number;
	worker?: string;
};

export async function scanScheduledPublishHealthIssues(input?: { userId?: string; limit?: number }): Promise<{
	overdueWithoutJob: number;
	stalePublishingJobs: number;
	issues: ScheduledPublishHealthIssue[];
}> {
	const admin = getSupabaseService();
	const nowIso = new Date().toISOString();
	const limit = input?.limit ?? 200;

	let memoryQuery = admin
		.from('content_memory')
		.select('id, user_id, channel, publication_date')
		.eq('publication_status', 'scheduled')
		.in('channel', [...NATIVE_PUBLISH_CHANNELS])
		.lt('publication_date', nowIso)
		.limit(limit);
	if (input?.userId) memoryQuery = memoryQuery.eq('user_id', input.userId);

	const { data: overdueRows } = await memoryQuery;
	const store = getIntelligenceStore();
	let overdueWithoutJob = 0;

	for (const row of overdueRows ?? []) {
		const memory = await store.getMemory(row.user_id, row.id);
		if (!memory || memory.publicationStatus !== 'scheduled') continue;
		const armed = await jobIsArmedForMemory(row.user_id, memory);
		if (!armed) overdueWithoutJob += 1;
	}

	const stalePublishingJobs = await (async () => {
		const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
		let q = admin
			.from('publish_jobs')
			.select('id', { count: 'exact', head: true })
			.eq('status', 'publishing')
			.lt('updated_at', staleBefore);
		if (input?.userId) q = q.eq('user_id', input.userId);
		const { count } = await q;
		return count ?? 0;
	})();

	const issues: ScheduledPublishHealthIssue[] = [];
	if (overdueWithoutJob > 0) {
		issues.push({
			kind: 'overdue_without_job',
			message: `${overdueWithoutJob} scheduled post(s) are overdue with no active publish job.`,
			count: overdueWithoutJob,
		});
	}
	if (stalePublishingJobs > 0) {
		issues.push({
			kind: 'stale_publishing',
			message: `${stalePublishingJobs} publish job(s) appear stuck in publishing.`,
			count: stalePublishingJobs,
		});
	}

	return { overdueWithoutJob, stalePublishingJobs, issues };
}
