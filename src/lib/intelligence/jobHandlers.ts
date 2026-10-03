import { ingestBrandLinkedInAnalytics } from './ingestion/linkedin';
import { publishStoredMemory } from './publishMemory';
import type { IntelligenceStore } from './store';
import type { WorkflowJob } from './types';

export function getDefaultJobHandlers(store: IntelligenceStore) {
	return {
		async publishing(job: WorkflowJob) {
			const memoryId = String(job.referenceId || job.payload.memoryId || '');
			if (!memoryId) throw new Error('publishing job missing memoryId');
			const memory = await store.getMemory(job.userId, memoryId);
			if (!memory) throw new Error('Content memory not found');
			const result = await publishStoredMemory(store, job.userId, memory);
			return { destination: result.destination, externalId: result.externalId, url: result.url };
		},

		async analytics_sync(job: WorkflowJob) {
			const brandBrainId = job.brandBrainId;
			if (!brandBrainId) throw new Error('analytics_sync missing brandBrainId');
			const brain = await store.getBrandBrainById(job.userId, brandBrainId);
			if (!brain) throw new Error('Brand brain not found');
			return ingestBrandLinkedInAnalytics(store, job.userId, brain.airtableBrandId);
		},

		async notification() {
			return { skipped: 'No native notifier configured yet' };
		},
		async generation() {
			return { skipped: 'Use draft_content / execute_theme_plan' };
		},
		async research() {
			return { skipped: true };
		},
		async review() {
			return { skipped: true };
		},
		async theme_plan() {
			return { skipped: 'Use execute_theme_plan' };
		},
		async brief() {
			return { skipped: true };
		},
	};
}
