import type { ContentMemoryRecord } from '@/lib/intelligence/types';
import type { PublishJobRow } from '@/lib/publish/contentPublishDiagnostics';
import { isStalePublishingJob } from '@/lib/publish/publishJobLifecycle';

function isScheduledOverdue(memory: Pick<ContentMemoryRecord, 'publicationStatus' | 'publicationDate'>): boolean {
	if (memory.publicationStatus !== 'scheduled' || !memory.publicationDate) return false;
	const due = new Date(memory.publicationDate);
	return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
}

const NATIVE_PUBLISH_CHANNELS = new Set(['instagram', 'facebook', 'threads']);

export function schedulePublishWarning(
	memory: Pick<ContentMemoryRecord, 'channel' | 'publicationStatus' | 'publicationDate'>,
	job: PublishJobRow | undefined,
): string | null {
	const channel = String(memory.channel).toLowerCase();
	if (!NATIVE_PUBLISH_CHANNELS.has(channel)) return null;
	if (memory.publicationStatus !== 'scheduled') return null;

	const overdue = isScheduledOverdue(memory);
	const jobStatus = job?.status ?? null;

	if (overdue && !jobStatus) {
		return 'Overdue with no publish job. Check publish cron configuration or reconnect the channel.';
	}
	if (overdue && jobStatus === 'publishing' && job && isStalePublishingJob(job)) {
		return 'Publish job appears stuck. The next cron run will retry automatically.';
	}
	if (overdue && (jobStatus === 'queued' || jobStatus === 'retrying')) {
		return 'Overdue but a publish job is queued. If this persists, verify the Meta or Threads publish cron is running.';
	}
	if (!overdue && !jobStatus && memory.publicationDate) {
		const dueMs = new Date(memory.publicationDate).getTime();
		if (!Number.isNaN(dueMs) && dueMs - Date.now() < 24 * 60 * 60 * 1000) {
			return 'Scheduled soon but no publish job yet. It will be created on the next sync or cron run.';
		}
	}
	return null;
}
