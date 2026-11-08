import 'server-only';

import { generateArticle } from './pipeline';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { articleGenerationRunsInline, resolveArticleGenerationWorkerSecret } from '@/lib/ai/longFormConfig';
import { enqueueWorkflowJob } from '@/lib/intelligence/jobs';
import { getNativeContentStore } from '@/lib/media/store';
import type { WorkflowJob } from '@/lib/intelligence/types';

export type ArticleGenerationJobPayload = {
	brandId: string;
	topic?: string;
	objective?: string;
	instruction?: string;
	targetWords?: number;
	credentialId?: string;
	articleId?: string;
	destinationId?: string;
	primaryKeyword?: string;
	audience?: string;
	searchIntent?: string;
	contentType?: string;
	skipAutoRevision?: boolean;
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
	const payload = job.payload as ArticleGenerationJobPayload & { result?: ArticleGenerationJobResult | null };
	const priorId = payload.result?.articleId ?? payload.articleId;
	if (payload.result?.articleId) {
		const existing = await getNativeContentStore().getArticle(job.userId, payload.result.articleId);
		if (existing?.body && existing.workspace?.generation.status === 'completed') {
			return { articleId: existing.id };
		}
	}
	const brain =
		(await store.getBrandBrainById(job.userId, payload.brandId)) ??
		(await store.getBrandBrain(job.userId, payload.brandId));
	if (!brain) throw new Error('Brand brain not found for article generation job.');
	const strategy = await store.getStrategyForBrand(job.userId, brain.id);
	const themes = await store.listThemes(job.userId, brain.id);
	const { getAgentStore } = await import('@/lib/agent/controlStore');
	const { selectRelevantResearch } = await import('@/lib/research/retrieve');
	const researchRecords = selectRelevantResearch(
		await getAgentStore().listResearch(job.userId, brain.id),
		`${payload.topic ?? ''} ${payload.instruction ?? ''}`,
	);
	const article = await generateArticle({
		ownerUserId: job.userId,
		brand: brain,
		strategy,
		themes,
		objective: payload.objective,
		topic: payload.topic,
		targetWords: payload.targetWords,
		instruction: payload.instruction,
		researchRecords,
		articleId: priorId,
		destinationId: payload.destinationId,
		primaryKeyword: payload.primaryKeyword,
		audience: payload.audience,
		searchIntent: payload.searchIntent,
		contentType: payload.contentType,
		skipAutoRevision: payload.skipAutoRevision,
	});
	if (article.workspace) article.workspace.generation.jobId = job.id;
	await getNativeContentStore().saveArticle(article);
	return { articleId: article.id };
}

export async function noteGenerationFailure(job: WorkflowJob, message: string): Promise<void> {
	const articleId = (job.payload as ArticleGenerationJobPayload).articleId;
	if (!articleId) return;
	const articles = getNativeContentStore();
	const article = await articles.getArticle(job.userId, articleId);
	if (!article?.workspace) return;
	article.workspace.generation.status = 'failed';
	article.workspace.generation.error = message;
	article.workspace.generation.jobId = job.id;
	article.updatedAt = new Date().toISOString();
	await articles.saveArticle(article);
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

/** A processing job older than this is treated as timed out so the owner can retry the same article. */
export const ARTICLE_GENERATION_STALE_MS = 8 * 60 * 1000;

export function articleGenerationJobIsStale(job: WorkflowJob, now = Date.now()): boolean {
	if (job.status !== 'queued' && job.status !== 'processing' && job.status !== 'retrying') return false;
	const stamp = Date.parse(job.startedAt ?? job.createdAt);
	if (!Number.isFinite(stamp)) return false;
	const limit = job.status === 'processing' ? ARTICLE_GENERATION_STALE_MS : 2 * 60 * 1000;
	return now - stamp > limit;
}

export async function runArticleGenerationInline(jobId: string): Promise<void> {
	const store = getIntelligenceStore();
	const job = await store.claimJobById(jobId);
	if (!job) return;
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
		await noteGenerationFailure(job, message);
		throw error;
	}
}

export async function dispatchArticleGenerationWorker(jobId: string): Promise<void> {
	if (articleGenerationRunsInline()) {
		await runArticleGenerationInline(jobId);
		return;
	}
	const secret = resolveArticleGenerationWorkerSecret();
	if (!secret) {
		throw new Error('AGENT_ARTICLE_GENERATION_SECRET is not configured.');
	}

	const base = (process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
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
