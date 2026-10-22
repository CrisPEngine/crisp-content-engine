import type { PublishWorkerId } from '@/lib/publish/workerHeartbeat';

/** External cron-job.org typically hits Meta/Threads every 30 minutes. */
export const PUBLISH_WORKER_EXPECTED_INTERVAL_MS: Record<Exclude<PublishWorkerId, 'publish-watchdog'>, number> = {
	'meta-due': 30 * 60 * 1000,
	'threads-due': 30 * 60 * 1000,
	'linkedin-due': 60 * 60 * 1000,
};

export const PUBLISH_WORKER_STALE_MULTIPLIER = 2;

/** After this long past publicationDate, a still-scheduled post is treated as missed. */
export const PUBLISH_OVERDUE_GRACE_MS = 60 * 60 * 1000;

export type PublishJobSnapshot = {
	status: string;
	scheduled_time: string;
	next_attempt_at: string | null;
	attempts: number;
};

export function publishWorkerStaleThresholdMs(worker: PublishWorkerId): number {
	if (worker === 'publish-watchdog') {
		return 2 * 45 * 60 * 1000;
	}
	return PUBLISH_WORKER_EXPECTED_INTERVAL_MS[worker] * PUBLISH_WORKER_STALE_MULTIPLIER;
}

export function evaluatePublishWorkerStale(input: {
	worker: PublishWorkerId;
	lastRunAt: string | null;
	nowMs?: number;
}): { stale: boolean; ageMs: number | null; staleAfterMs: number } {
	const staleAfterMs = publishWorkerStaleThresholdMs(input.worker);
	if (!input.lastRunAt) {
		return { stale: true, ageMs: null, staleAfterMs };
	}
	const ageMs = (input.nowMs ?? Date.now()) - new Date(input.lastRunAt).getTime();
	if (Number.isNaN(ageMs)) {
		return { stale: true, ageMs: null, staleAfterMs };
	}
	return { stale: ageMs > staleAfterMs, ageMs, staleAfterMs };
}

export function workerLabel(worker: PublishWorkerId): string {
	switch (worker) {
		case 'meta-due':
			return 'Meta/Instagram publish cron';
		case 'threads-due':
			return 'Threads publish cron';
		case 'linkedin-due':
			return 'LinkedIn publish cron';
		case 'publish-watchdog':
			return 'Publish watchdog';
		default:
			return worker;
	}
}

export function formatWorkerLastRun(lastRunAt: string | null): string {
	if (!lastRunAt) return 'never';
	try {
		return new Date(lastRunAt).toISOString();
	} catch {
		return 'unknown';
	}
}

export function cronStaleAlertMessage(worker: PublishWorkerId, lastRunAt: string | null, staleAfterMs: number): string {
	const minutes = Math.round(staleAfterMs / 60000);
	return `${workerLabel(worker)} has not run recently (last run: ${formatWorkerLastRun(lastRunAt)}; expected at least every ${minutes} minutes). Check cron-job.org or your scheduler.`;
}

export function isQueueablePublishJobStatus(status: string): boolean {
	return status === 'queued' || status === 'retrying';
}

export function isPublishJobDueForWorker(job: PublishJobSnapshot, now: Date = new Date()): boolean {
	if (!isQueueablePublishJobStatus(job.status)) return false;
	const nowIso = now.toISOString();
	if (job.scheduled_time > nowIso) return false;
	if (job.next_attempt_at && job.next_attempt_at > nowIso) return false;
	return true;
}

export type MissedPublishClassification =
	| { kind: 'none' }
	| { kind: 'missed'; reason: string; userMessage: string };

/**
 * Classify whether scheduled content past the grace window should be marked failed.
 * Does not perform I/O; safe for unit tests.
 */
export function classifyMissedScheduledPublish(input: {
	publicationStatus: string;
	publicationDate: string | null | undefined;
	job: PublishJobSnapshot | null | undefined;
	now?: Date;
	graceMs?: number;
	publishingStale?: boolean;
}): MissedPublishClassification {
	const now = input.now ?? new Date();
	const graceMs = input.graceMs ?? PUBLISH_OVERDUE_GRACE_MS;

	if (input.publicationStatus !== 'scheduled' || !input.publicationDate) {
		return { kind: 'none' };
	}
	const dueMs = new Date(input.publicationDate).getTime();
	if (Number.isNaN(dueMs) || dueMs + graceMs > now.getTime()) {
	 return { kind: 'none' };
	}

	const job = input.job;
	if (!job) {
		return {
			kind: 'missed',
			reason: 'no_publish_job',
			userMessage:
				'Scheduled publish time passed with no publish attempt. No publish job was found. Check publish cron configuration or reconnect the channel.',
		};
	}

	if (job.status === 'published') {
		return { kind: 'none' };
	}

	if (job.status === 'publishing') {
		if (input.publishingStale) {
			return {
				kind: 'missed',
				reason: 'stale_publishing',
				userMessage:
					'Scheduled publish time passed and the publish job appears stuck. The watchdog marked this as failed so it will not double post when the cron resumes.',
			};
		}
		return { kind: 'none' };
	}

	if (isQueueablePublishJobStatus(job.status)) {
		if (!isPublishJobDueForWorker(job, now)) {
			return { kind: 'none' };
		}
		if (job.attempts > 0) {
			return { kind: 'none' };
		}
		return {
			kind: 'missed',
			reason: 'no_publish_attempt',
			userMessage:
				'Scheduled publish time passed with no publish attempt. The publish cron may be stopped or misconfigured.',
		};
	}

	if (job.status === 'failed') {
		return { kind: 'none' };
	}

	return { kind: 'none' };
}

export type PublishHealthBanner = {
	severity: 'warning' | 'error';
	title: string;
	details: string[];
};

export function buildPublishHealthBanners(input: {
	staleWorkers: Array<{ worker: PublishWorkerId; lastRunAt: string | null; staleAfterMs: number }>;
	overdueWithoutJob: number;
	missedPublishCount?: number;
	cronSecretConfigured: boolean;
}): PublishHealthBanner[] {
	const banners: PublishHealthBanner[] = [];

	if (!input.cronSecretConfigured) {
		banners.push({
			severity: 'error',
			title: 'Publish cron is not configured',
			details: ['CRON_SECRET is not set. Publish workers will return errors until it is configured in production.'],
		});
	}

	for (const worker of input.staleWorkers) {
		banners.push({
			severity: 'warning',
			title: 'Publish scheduler may be stopped',
			details: [cronStaleAlertMessage(worker.worker, worker.lastRunAt, worker.staleAfterMs)],
		});
	}

	if (input.overdueWithoutJob > 0) {
		banners.push({
			severity: 'warning',
			title: 'Overdue scheduled posts',
			details: [
				`${input.overdueWithoutJob} scheduled post(s) are past due without an active publish job. They may publish on the next cron run or be marked failed by the watchdog.`,
			],
		});
	}

	if ((input.missedPublishCount ?? 0) > 0) {
		banners.push({
			severity: 'error',
			title: 'Missed publish window',
			details: [
				`${input.missedPublishCount} post(s) were marked failed because the scheduled time passed with no successful publish attempt.`,
			],
		});
	}

	return banners;
}
