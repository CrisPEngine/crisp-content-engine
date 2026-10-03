import type { IntelligenceStore } from './store';
import type { WorkflowJob, WorkflowJobType } from './types';

export async function enqueueWorkflowJob(
	store: IntelligenceStore,
	userId: string,
	input: {
		jobType: WorkflowJobType | string;
		payload?: Record<string, unknown>;
		brandBrainId?: string;
		referenceId?: string;
	},
): Promise<WorkflowJob> {
	return store.enqueueJob(userId, {
		jobType: input.jobType,
		status: 'queued',
		payload: input.payload ?? {},
		brandBrainId: input.brandBrainId,
		referenceId: input.referenceId,
		maxRetries: 3,
	});
}

export async function processNextWorkflowJob(
	store: IntelligenceStore,
	handlers: Partial<Record<string, (job: WorkflowJob) => Promise<Record<string, unknown> | void>>>,
): Promise<WorkflowJob | null> {
	const job = await store.claimNextJob();
	if (!job) return null;

	const handler = handlers[job.jobType];
	try {
		if (!handler) {
			throw new Error(`No handler registered for job type ${job.jobType}`);
		}
		const result = await handler(job);
		return store.updateJob(job.id, {
			status: 'completed',
			completedAt: new Date().toISOString(),
			payload: { ...job.payload, result: result ?? null },
			lastError: undefined,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Job failed';
		const retryCount = job.retryCount + 1;
		const status = retryCount <= job.maxRetries ? 'retrying' : 'failed';
		console.error('[workflow_job]', {
			job_id: job.id,
			job_type: job.jobType,
			status,
			retry_count: retryCount,
			error: message,
		});
		return store.updateJob(job.id, {
			status,
			retryCount,
			lastError: message,
			completedAt: status === 'failed' ? new Date().toISOString() : undefined,
		});
	}
}
