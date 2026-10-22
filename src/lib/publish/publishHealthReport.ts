import 'server-only';

import { isMetaPublishingEnabled, isThreadsPublishingEnabled } from '@/lib/featureFlags';
import { countStalePublishingJobs } from '@/lib/publish/publishJobLifecycle';
import { scanScheduledPublishHealthIssues } from '@/lib/publish/reconcileScheduledPublish';
import {
	buildPublishHealthBanners,
	cronStaleAlertMessage,
	publishWorkerStaleThresholdMs,
} from '@/lib/publish/publishWatchdogLogic';
import { getPublishWorkerHeartbeats, type PublishWorkerId } from '@/lib/publish/workerHeartbeat';

function monitoredPublishWorkers(): PublishWorkerId[] {
	const workers: PublishWorkerId[] = [];
	if (isMetaPublishingEnabled()) workers.push('meta-due');
	if (isThreadsPublishingEnabled()) workers.push('threads-due');
	workers.push('linkedin-due');
	return workers;
}

export async function getPublishHealthReport(input?: { userId?: string }) {
	const cronConfigured = Boolean(process.env.CRON_SECRET?.trim());
	const publishWorkers = await getPublishWorkerHeartbeats(monitoredPublishWorkers());
	const scheduleHealth = await scanScheduledPublishHealthIssues({ userId: input?.userId });
	const stalePublishingJobs = await countStalePublishingJobs();

	const staleWorkers = publishWorkers
		.filter((w) => w.stale)
		.map((w) => ({
			worker: w.worker,
			lastRunAt: w.lastRunAt,
			staleAfterMs: publishWorkerStaleThresholdMs(w.worker),
		}));

	const publishWarnings: string[] = [...scheduleHealth.issues.map((issue) => issue.message)];
	if (!cronConfigured) {
		publishWarnings.push(
			'CRON_SECRET is not set. Publish workers will return 500 until it is configured in production.',
		);
	}
	for (const worker of publishWorkers) {
		if (worker.stale) {
			publishWarnings.push(
				cronStaleAlertMessage(worker.worker, worker.lastRunAt, publishWorkerStaleThresholdMs(worker.worker)),
			);
		}
	}

	const banners = buildPublishHealthBanners({
		staleWorkers,
		overdueWithoutJob: scheduleHealth.overdueWithoutJob,
		cronSecretConfigured: cronConfigured,
	});

	const status = publishWarnings.length > 0 ? 'degraded' : 'ok';

	return {
		status,
		publishWorkers,
		publishScheduleHealth: {
			overdueWithoutJob: scheduleHealth.overdueWithoutJob,
			stalePublishingJobs,
			cronSecretConfigured: cronConfigured,
		},
		publishWarnings,
		banners,
	};
}
