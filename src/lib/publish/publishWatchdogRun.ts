import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { isMetaPublishingEnabled, isThreadsPublishingEnabled } from '@/lib/featureFlags';
import {
	agentMetaPlatformFromChannel,
	isAgentMetaMemory,
} from '@/lib/publish/agentMetaJob';
import { isAgentThreadsMemory } from '@/lib/publish/agentThreadsJob';
import { isStalePublishingJob } from '@/lib/publish/publishJobLifecycle';
import {
	healFailedPublishScheduleMismatch,
	promoteMemoryForPublishReconcile,
	reconcileScheduledNativePublishJobs,
	recordScheduledPublishFailure,
	scanScheduledPublishHealthIssues,
} from '@/lib/publish/reconcileScheduledPublish';
import { recoverStalePublishingJobs } from '@/lib/publish/publishJobLifecycle';
import { META_PUBLISH_PLATFORMS } from '@/lib/publish/dueJobsQuery';
import {
	classifyMissedScheduledPublish,
	cronStaleAlertMessage,
	PUBLISH_OVERDUE_GRACE_MS,
	publishWorkerStaleThresholdMs,
} from '@/lib/publish/publishWatchdogLogic';
import {
	getPublishWorkerHeartbeats,
	recordPublishWorkerRun,
	type PublishWorkerId,
} from '@/lib/publish/workerHeartbeat';

const NATIVE_PUBLISH_CHANNELS = ['instagram', 'facebook', 'threads'] as const;

function activePublishWorkers(): PublishWorkerId[] {
	const workers: PublishWorkerId[] = ['publish-watchdog'];
	if (isMetaPublishingEnabled()) workers.push('meta-due');
	if (isThreadsPublishingEnabled()) workers.push('threads-due');
	workers.push('linkedin-due');
	return workers;
}

async function findLatestPublishJob(input: {
	userId: string;
	contentItemKey: string;
	platform: string;
}): Promise<{
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	attempts: number;
	id: string;
	updated_at: string;
} | null> {
	const admin = getSupabaseService();
	const { data } = await admin
		.from('publish_jobs')
		.select('id, status, scheduled_time, next_attempt_at, attempts, updated_at')
		.eq('user_id', input.userId)
		.eq('content_item_key', input.contentItemKey)
		.eq('platform', input.platform)
		.order('updated_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	return data ?? null;
}

async function cancelQueueablePublishJob(jobId: string, reason: string): Promise<boolean> {
	const admin = getSupabaseService();
	const now = new Date().toISOString();
	const { data, error } = await admin
		.from('publish_jobs')
		.update({
			status: 'failed',
			error_message: reason,
			updated_at: now,
		})
		.eq('id', jobId)
		.in('status', ['queued', 'retrying', 'publishing'])
		.select('id')
		.maybeSingle();
	if (error) {
		console.error('[Publish Watchdog] Failed to cancel publish job:', error.message);
		return false;
	}
	return Boolean(data?.id);
}

export type PublishWatchdogRunResult = {
	ok: boolean;
	staleWorkers: PublishWorkerId[];
	scheduleHealth: Awaited<ReturnType<typeof scanScheduledPublishHealthIssues>>;
	missedMarkedFailed: number;
	reconcile: Awaited<ReturnType<typeof reconcileScheduledNativePublishJobs>>;
	healMismatch: Awaited<ReturnType<typeof healFailedPublishScheduleMismatch>>;
	staleRecovery: Awaited<ReturnType<typeof recoverStalePublishingJobs>>;
};

export async function runPublishWatchdog(input?: { now?: Date; limit?: number }): Promise<PublishWatchdogRunResult> {
	const now = input?.now ?? new Date();
	const limit = input?.limit ?? 100;
	const graceCutoffIso = new Date(now.getTime() - PUBLISH_OVERDUE_GRACE_MS).toISOString();

	const staleRecovery = await recoverStalePublishingJobs({
		platforms: [...META_PUBLISH_PLATFORMS, 'threads'],
	});
	const healMismatch = await healFailedPublishScheduleMismatch({ now, limit });
	const reconcile = await reconcileScheduledNativePublishJobs({ now, limit: limit * 2 });

	const scheduleHealth = await scanScheduledPublishHealthIssues({ limit: limit * 2 });

	const workersToMonitor = activePublishWorkers().filter((w) => w !== 'publish-watchdog');
	const publishWorkers = await getPublishWorkerHeartbeats(workersToMonitor);
	const staleWorkers = publishWorkers.filter((w) => w.stale).map((w) => w.worker);

	const admin = getSupabaseService();
	const { data: overdueRows } = await admin
		.from('content_memory')
		.select('id, user_id, channel, publication_date, publication_status')
		.eq('publication_status', 'scheduled')
		.in('channel', [...NATIVE_PUBLISH_CHANNELS])
		.lt('publication_date', graceCutoffIso)
		.limit(limit);

	const store = getIntelligenceStore();
	let missedMarkedFailed = 0;

	for (const row of overdueRows ?? []) {
		let memory = await store.getMemory(row.user_id, row.id);
		if (!memory) continue;
		memory = await promoteMemoryForPublishReconcile(row.user_id, memory);
		if (memory.publicationStatus !== 'scheduled') continue;

		let platform: string | null = null;
		if (isAgentThreadsMemory(memory)) platform = 'threads';
		else if (isAgentMetaMemory(memory)) platform = agentMetaPlatformFromChannel(String(memory.channel));

		const jobRow = platform
			? await findLatestPublishJob({
					userId: row.user_id,
					contentItemKey: memory.id,
					platform,
				})
			: null;

		const publishingStale = jobRow?.status === 'publishing' && isStalePublishingJob(jobRow);

		const classification = classifyMissedScheduledPublish({
			publicationStatus: memory.publicationStatus,
			publicationDate: memory.publicationDate,
			job: jobRow
				? {
						status: jobRow.status,
						scheduled_time: jobRow.scheduled_time,
						next_attempt_at: jobRow.next_attempt_at,
						attempts: jobRow.attempts ?? 0,
					}
				: null,
			now,
			publishingStale,
		});

		if (classification.kind !== 'missed') continue;

		if (jobRow?.id) {
			const cancelled = await cancelQueueablePublishJob(
				jobRow.id,
				`Watchdog: ${classification.reason} (no double post)`,
			);
			if (!cancelled && jobRow.status === 'published') continue;
		}

		await recordScheduledPublishFailure(row.user_id, memory, classification.userMessage);
		missedMarkedFailed += 1;
	}

	await recordPublishWorkerRun({ worker: 'publish-watchdog', ok: true, processed: missedMarkedFailed, at: now });

	return {
		ok: true as const,
		staleWorkers,
		scheduleHealth,
		missedMarkedFailed,
		reconcile,
		healMismatch,
		staleRecovery,
	};
}

export function publishWorkerStaleMessages(
	publishWorkers: Awaited<ReturnType<typeof getPublishWorkerHeartbeats>>,
): string[] {
	return publishWorkers
		.filter((w) => w.stale)
		.map((w) => cronStaleAlertMessage(w.worker, w.lastRunAt, publishWorkerStaleThresholdMs(w.worker)));
}
