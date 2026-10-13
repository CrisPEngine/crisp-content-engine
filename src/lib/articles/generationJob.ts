import 'server-only';

import { generateArticle } from './pipeline';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { articleGenerationRunsInline, resolveArticleGenerationWorkerSecret } from '@/lib/ai/longFormConfig';
import { enqueueWorkflowJob } from '@/lib/intelligence/jobs';
import type { WorkflowJob } from '@/lib/intelligence/types';

export type ArticleGenerationJobPayload = {
	brandId: string;
	topic?: string;
	objective?: string;
	instruction?: string;
	targetWords?: number;
	credentialId?: string;
};

export type ArticleGenerationJobResult = {
	articleId?: string;
	error?: string;
};

export async function enqueueArticleGenerationJob(input: {
	ownerUserId: string;
	brandBrainId: string;
	payload: ArticleGenerationJobPayload;
}): Promise<WorkflowJob> {
	const store = getIntelligenceStore();
	return enqueueWorkflowJob(store, input.ownerUserId, {
		jobType: 'article_generation',
		brandBrainId: input.brandBrainId,
		payload: input.payload,
	});
}

export async function runArticleGenerationJob(job: WorkflowJob): Promise<ArticleGenerationJobResult> {
	const store = getIntelligenceStore();
	const payload = job.payload as ArticleGenerationJobPayload;
	const brain =
		(await store.getBrandBrainById(job.userId, payload.brandId)) ??
		(await store.getBrandBrain(job.userId, payload.brandId));
	if (!brain) throw new Error('Brand brain not found for article generation job.');
	const strategy = await store.getStrategyForBrand(job.userId, brain.id);
	const themes = await store.listThemes(job.userId, brain.id);
	const article = await generateArticle({
		ownerUserId: job.userId,
		brand: brain,
		strategy,
		themes,
		objective: payload.objective,
		topic: payload.topic,
		targetWords: payload.targetWords,
		instruction: payload.instruction,
	});
	return { articleId: article.id };
}

export function publicArticleGenerationJob(job: WorkflowJob): Record<string, unknown> {
	const payload = job.payload as ArticleGenerationJobPayload & { result?: ArticleGenerationJobResult | null };
	const result = payload.result ?? null;
	return {
		jobId: job.id,
		status: job.status,
		articleId: result?.articleId ?? null,
		error: job.lastError ?? result?.error ?? null,
		createdAt: job.createdAt,
		startedAt: job.startedAt ?? null,
		completedAt: job.completedAt ?? null,
	};
}

export async function dispatchArticleGenerationWorker(jobId: string): Promise<void> {
	if (articleGenerationRunsInline()) {
		const store = getIntelligenceStore();
		const job = await store.claimJobById(jobId) ?? (await store.getJobById(jobId));
		if (!job) return;
		if (job.status === 'queued' || job.status === 'retrying') {
			job.status = 'processing';
			job.startedAt = new Date().toISOString();
		}
		try {
			const result = await runArticleGenerationJob(job);
			await store.updateJob(job.id, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				payload: { ...job.payload, result },
				lastError: undefined,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Article generation failed';
			await store.updateJob(job.id, {
				status: 'failed',
				completedAt: new Date().toISOString(),
				lastError: message,
			});
			throw error;
		}
		return;
	}

	const secret = resolveArticleGenerationWorkerSecret();
	const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
	if (!secret) {
		throw new Error('AGENT_ARTICLE_GENERATION_SECRET is not configured.');
	}
	const response = await fetch(`${base}/api/agent/v1/article-generate`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-agent-article-generate-secret': secret,
		},
		body: JSON.stringify({ jobId }),
	});
	if (!response.ok && response.status !== 202) {
		const text = await response.text().catch(() => '');
		throw new Error(`Article generation worker dispatch failed (${response.status}): ${text.slice(0, 200)}`);
	}
}
