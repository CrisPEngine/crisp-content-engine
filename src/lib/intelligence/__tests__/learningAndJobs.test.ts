import { describe, expect, it } from 'vitest';
import { analyseEditDiff, nextConfidence } from '../editLearning';
import { enqueueWorkflowJob, processNextWorkflowJob } from '../jobs';
import { createMemoryIntelligenceStore } from '../memoryStore';

describe('user edit learning', () => {
	it('extracts hook, CTA, and promotional-language signals without promoting a one-off to confirmed', () => {
		const signals = analyseEditDiff(
			'Unlock your potential. Sign up today.\nWe leverage synergy to delight customers.',
			'Folian keeps canon intact.\nIf you want, look at story memory — no countdown clocks.',
		);
		expect(signals.some((signal) => signal.signalType === 'hook_changed')).toBe(true);
		expect(signals.some((signal) => signal.signalType === 'cta_softened' || signal.signalType === 'promotional_language_removed')).toBe(true);
		expect(nextConfidence('candidate', 1)).toBe('candidate');
		expect(nextConfidence('candidate', 3)).toBe('observed');
		expect(nextConfidence('observed', 6)).toBe('strong');
	});
});

describe('native workflow jobs', () => {
	it('moves jobs through queued → processing → completed and retries on failure', async () => {
		const store = createMemoryIntelligenceStore();
		const job = await enqueueWorkflowJob(store, 'user-1', { jobType: 'notification', payload: { n: 1 } });
		expect(job.status).toBe('queued');

		const completed = await processNextWorkflowJob(store, {
			notification: async () => ({ ok: true }),
		});
		expect(completed?.status).toBe('completed');

		await enqueueWorkflowJob(store, 'user-1', { jobType: 'research' });
		const failedOnce = await processNextWorkflowJob(store, {
			research: async () => {
				throw new Error('transient');
			},
		});
		expect(failedOnce?.status).toBe('retrying');
		expect(failedOnce?.retryCount).toBe(1);
	});
});
