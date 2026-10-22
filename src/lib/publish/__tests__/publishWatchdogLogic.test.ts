import { describe, expect, it } from 'vitest';
import {
	buildPublishHealthBanners,
	classifyMissedScheduledPublish,
	cronStaleAlertMessage,
	evaluatePublishWorkerStale,
	isPublishJobDueForWorker,
	PUBLISH_OVERDUE_GRACE_MS,
	publishWorkerStaleThresholdMs,
} from '@/lib/publish/publishWatchdogLogic';

describe('evaluatePublishWorkerStale', () => {
	it('marks worker stale when last run is older than 2x expected interval', () => {
		const staleAfter = publishWorkerStaleThresholdMs('meta-due');
		const lastRunAt = new Date(Date.now() - staleAfter - 1000).toISOString();
		const result = evaluatePublishWorkerStale({ worker: 'meta-due', lastRunAt });
		expect(result.stale).toBe(true);
		expect(result.staleAfterMs).toBe(staleAfter);
	});

	it('marks worker healthy when last run is recent', () => {
		const lastRunAt = new Date().toISOString();
		const result = evaluatePublishWorkerStale({ worker: 'threads-due', lastRunAt });
		expect(result.stale).toBe(false);
	});

	it('marks worker stale when no heartbeat exists', () => {
		const result = evaluatePublishWorkerStale({ worker: 'meta-due', lastRunAt: null });
		expect(result.stale).toBe(true);
	});
});

describe('classifyMissedScheduledPublish', () => {
	const pastDue = new Date(Date.now() - PUBLISH_OVERDUE_GRACE_MS - 60_000).toISOString();

	it('returns none before grace window elapses', () => {
		const soon = new Date(Date.now() - 5 * 60_000).toISOString();
		expect(
			classifyMissedScheduledPublish({
				publicationStatus: 'scheduled',
				publicationDate: soon,
				job: null,
			}).kind,
		).toBe('none');
	});

	it('flags overdue scheduled content with no job', () => {
		const result = classifyMissedScheduledPublish({
			publicationStatus: 'scheduled',
			publicationDate: pastDue,
			job: null,
		});
		expect(result.kind).toBe('missed');
		if (result.kind === 'missed') {
			expect(result.reason).toBe('no_publish_job');
		}
	});

	it('flags due queued job with zero attempts as missed', () => {
		const result = classifyMissedScheduledPublish({
			publicationStatus: 'scheduled',
			publicationDate: pastDue,
			job: {
				status: 'queued',
				scheduled_time: pastDue,
				next_attempt_at: null,
				attempts: 0,
			},
		});
		expect(result.kind).toBe('missed');
		if (result.kind === 'missed') {
			expect(result.reason).toBe('no_publish_attempt');
		}
	});

	it('does not flag when worker already attempted publish', () => {
		const result = classifyMissedScheduledPublish({
			publicationStatus: 'scheduled',
			publicationDate: pastDue,
			job: {
				status: 'retrying',
				scheduled_time: pastDue,
				next_attempt_at: null,
				attempts: 1,
			},
		});
		expect(result.kind).toBe('none');
	});

	it('does not flag in-flight publishing unless stale', () => {
		expect(
			classifyMissedScheduledPublish({
				publicationStatus: 'scheduled',
				publicationDate: pastDue,
				job: {
					status: 'publishing',
					scheduled_time: pastDue,
					next_attempt_at: null,
					attempts: 1,
				},
				publishingStale: false,
			}).kind,
		).toBe('none');
	});
});

describe('isPublishJobDueForWorker', () => {
	it('respects next_attempt_at', () => {
		const future = new Date(Date.now() + 60_000).toISOString();
		expect(
			isPublishJobDueForWorker({
				status: 'queued',
				scheduled_time: '2020-01-01T00:00:00.000Z',
				next_attempt_at: future,
				attempts: 0,
			}),
		).toBe(false);
	});
});

describe('buildPublishHealthBanners', () => {
	it('includes cron stale messaging with last run time', () => {
		const message = cronStaleAlertMessage('meta-due', '2020-01-01T00:00:00.000Z', 60 * 60 * 1000);
		expect(message).toMatch(/Meta\/Instagram publish cron/);
		expect(message).toMatch(/2020-01-01T00:00:00.000Z/);

		const banners = buildPublishHealthBanners({
			staleWorkers: [{ worker: 'meta-due', lastRunAt: '2020-01-01T00:00:00.000Z', staleAfterMs: 60 * 60 * 1000 }],
			overdueWithoutJob: 0,
			cronSecretConfigured: true,
		});
		expect(banners.some((b) => b.title.includes('scheduler'))).toBe(true);
	});
});
