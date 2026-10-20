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
import { hasActiveQueueablePublishJob } from '@/lib/publish/publishJobActive';
import { realignQueuedPublishJobToPublicationDate } from '@/lib/publish/realignPublishJob';
import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import { needsApprovedScheduleRepair, repairApprovedScheduleMemory } from '@/lib/content/nativeQueueSchedule';

export type ReconcileScheduledPublishStats = {
	scanned: number;
	repaired: number;
	failed: number;
	skipped: number;
};

const NATIVE_PUBLISH_CHANNELS = ['instagram', 'facebook', 'threads'] as const;

/** Look ahead so missing jobs are created before the slot, not only after overdue. */
export const RECONCILE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;

/** Promote legacy approved rows with a publish time to scheduled before reconcile/repair. */
export async function promoteMemoryForPublishReconcile(
	userId: string,
	memory: ContentMemoryRecord,
): Promise<ContentMemoryRecord> {
	if (!needsApprovedScheduleRepair(memory)) return memory;
	const store = getIntelligenceStore();
	const repaired = repairApprovedScheduleMemory(memory);
	return store.saveMemory(userId, repaired);
}

async function alignPublishJobToMemoryPublicationDate(userId: string, memory: ContentMemoryRecord): Promise<boolean> {
	const publishAt = memory.publicationDate;
	if (!publishAt) return false;
	if (isAgentThreadsMemory(memory)) {
		const outcome = await realignQueuedPublishJobToPublicationDate({
			userId,
			contentItemKey: memory.id,
			platform: 'threads',
			publicationDate: publishAt,
		});
		return outcome.realigned;
	}
	const platform = agentMetaPlatformFromChannel(String(memory.channel));
	if (platform && isAgentMetaMemory(memory)) {
		const outcome = await realignQueuedPublishJobToPublicationDate({
			userId,
			contentItemKey: memory.id,
			platform,
			publicationDate: publishAt,
		});
		return outcome.realigned;
	}
	return false;
}

async function jobIsArmedForMemory(userId: string, memory: ContentMemoryRecord): Promise<boolean> {
	const publishAt = memory.publicationDate;
	if (isAgentThreadsMemory(memory)) {
		const check = await hasActiveQueueablePublishJob({
			userId,
			contentItemKey: memory.id,
			platform: 'threads',
			publishAt,
		});
		return check.active;
	}
	const platform = agentMetaPlatformFromChannel(String(memory.channel));
	if (platform && isAgentMetaMemory(memory)) {
		const check = await hasActiveQueueablePublishJob({
			userId,
			contentItemKey: memory.id,
			platform,
			publishAt,
		});
		return check.active;
	}
	return false;
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
	const publishAt = input.publishAt ?? input.memory.publicationDate;
	const armed = await hasActiveQueueablePublishJob({
		userId: input.userId,
		contentItemKey: input.memory.id,
		platform: 'threads',
		publishAt,
	});
	if (armed.active) return { repaired: false };
	try {
		const syncResult = await syncAgentThreadsPublishJob({
			userId: input.userId,
			memory: input.memory,
			publishAt: input.publishAt,
		});
		if (publishAt) {
			const realigned = await realignQueuedPublishJobToPublicationDate({
				userId: input.userId,
				contentItemKey: input.memory.id,
				platform: 'threads',
				publicationDate: publishAt,
			});
			if (realigned.realigned) return { repaired: true };
		}
		if (!syncResult.armed) {
			const message = syncResult.reason ?? syncResult.skipped ?? 'Threads publish queue sync did not arm publisher';
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
		const verified = await hasActiveQueueablePublishJob({
			userId: input.userId,
			contentItemKey: input.memory.id,
			platform: 'threads',
			publishAt,
		});
		if (!verified.active) {
			const message = verified.reason ?? 'no_publish_job';
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
		.in('publication_status', ['scheduled', 'approved'])
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
		let memory = await store.getMemory(row.user_id, row.id);
		if (!memory) {
			stats.skipped += 1;
			continue;
		}
		memory = await promoteMemoryForPublishReconcile(row.user_id, memory);
		if (memory.publicationStatus !== 'scheduled') {
			stats.skipped += 1;
			continue;
		}

		const publishAt = memory.publicationDate ?? row.publication_date ?? undefined;
		const overdue =
			publishAt && !Number.isNaN(new Date(publishAt).getTime()) && new Date(publishAt).getTime() < now.getTime();

		await alignPublishJobToMemoryPublicationDate(row.user_id, memory);

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

/** Restore content wrongly marked failed when a queueable job exists but times diverged. */
export async function healFailedPublishScheduleMismatch(input?: {
	userId?: string;
	now?: Date;
	limit?: number;
}): Promise<{ scanned: number; healed: number }> {
	const admin = getSupabaseService();
	const now = input?.now ?? new Date();
	const nowIso = now.toISOString();
	const limit = input?.limit ?? 50;

	let query = admin
		.from('content_memory')
		.select('id, user_id, channel, publication_status, publication_date, metadata')
		.eq('publication_status', 'failed')
		.in('channel', [...NATIVE_PUBLISH_CHANNELS])
		.not('publication_date', 'is', null)
		.lte('publication_date', nowIso)
		.limit(limit);
	if (input?.userId) query = query.eq('user_id', input.userId);

	const { data: rows } = await query;
	const store = getIntelligenceStore();
	let healed = 0;

	for (const row of rows ?? []) {
		const memory = await store.getMemory(row.user_id, row.id);
		if (!memory) continue;
		const lastError = String(memory.metadata?.lastPublishError ?? '');
		if (lastError !== 'scheduled_time_mismatch' && !lastError.includes('scheduled_time_mismatch')) continue;

		const realigned = await alignPublishJobToMemoryPublicationDate(row.user_id, memory);
		if (!realigned) continue;

		await store.saveMemory(row.user_id, {
			...memory,
			publicationStatus: 'scheduled',
			metadata: {
				...(memory.metadata ?? {}),
				lastPublishError: undefined,
				scheduleRepairFailedAt: undefined,
			},
		});
		healed += 1;
	}

	return { scanned: rows?.length ?? 0, healed };
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
		.select('id, user_id, channel, publication_date, publication_status')
		.in('publication_status', ['scheduled', 'approved'])
		.in('channel', [...NATIVE_PUBLISH_CHANNELS])
		.lt('publication_date', nowIso)
		.limit(limit);
	if (input?.userId) memoryQuery = memoryQuery.eq('user_id', input.userId);

	const { data: overdueRows } = await memoryQuery;
	const store = getIntelligenceStore();
	let overdueWithoutJob = 0;

	for (const row of overdueRows ?? []) {
		let memory = await store.getMemory(row.user_id, row.id);
		if (!memory) continue;
		memory = await promoteMemoryForPublishReconcile(row.user_id, memory);
		if (memory.publicationStatus !== 'scheduled') continue;
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
