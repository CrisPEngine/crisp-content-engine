import 'server-only';

import { applyArticleRevision, generateArticle } from './pipeline';
import { getIntelligenceAi, getIntelligenceStore } from '@/lib/intelligence/actions';
import { articleGenerationRunsInline, resolveArticleGenerationWorkerSecret } from '@/lib/ai/longFormConfig';
import { enqueueWorkflowJob } from '@/lib/intelligence/jobs';
import { getNativeContentStore } from '@/lib/media/store';
import type { WorkflowJob } from '@/lib/intelligence/types';
import { loadDestinationTaxonomy } from '@/lib/publishing/destinationRegistry';
import { editorialStatusFromFindings, ensureWorkspace, isOpenFinding } from './meta';
import { articleResearchFromApproved } from './researchPackage';
import { generationContextFromBrief } from './editorialBrief';
import { capabilitiesFromKnowledge, capabilityGuidance } from './productKnowledge';
import { reviewCurrentRevision } from './reviewRun';
import type { ArticleRecord } from './types';

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

export type ArticleRevisionJobPayload = {
	brandId: string;
	articleId: string;
	baseRevisionId: string;
	findingIds: string[];
	result?: ArticleRevisionJobResult;
};

export type ArticleRevisionJobResult = {
	articleId: string;
	baseRevisionId: string;
	resultRevisionId: string;
	applied: Array<{ id: string; change: string }>;
	notApplied: Array<{ id: string; reason: string }>;
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

export async function enqueueArticleRevisionJob(input: {
	ownerUserId: string;
	brandBrainId: string;
	payload: ArticleRevisionJobPayload;
}): Promise<WorkflowJob> {
	return enqueueWorkflowJob(getIntelligenceStore(), input.ownerUserId, {
		jobType: 'article_revision',
		brandBrainId: input.brandBrainId,
		payload: input.payload,
	});
}

async function updateArticle(ownerUserId: string, articleId: string, mutate: (article: ArticleRecord) => void): Promise<void> {
	const store = getNativeContentStore();
	const article = await store.getArticle(ownerUserId, articleId);
	if (!article) return;
	article.workspace = ensureWorkspace(article);
	mutate(article);
	article.updatedAt = new Date().toISOString();
	await store.saveArticle(article);
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
	const workspaceArticle = priorId ? await getNativeContentStore().getArticle(job.userId, priorId) : null;
	let research;
	let brief;
	let researchRecords;
	if (workspaceArticle?.workspace) {
		const pkg = workspaceArticle.workspace.research;
		if (!pkg?.approved) {
			throw new Error('Approve the research before generating. Generation uses only the approved research version.');
		}
		research = articleResearchFromApproved(pkg);
		const baseBrief = workspaceArticle.workspace.brief;
		const guidance = [
			generationContextFromBrief(workspaceArticle.workspace.editorialBrief?.current),
			capabilityGuidance(capabilitiesFromKnowledge(brain.knowledge)),
		].filter(Boolean).join('\n\n');
		brief = baseBrief ? { ...baseBrief, instructions: [baseBrief.instructions, guidance].filter(Boolean).join('\n\n') } : baseBrief;
	} else {
		const { getAgentStore } = await import('@/lib/agent/controlStore');
		const { selectRelevantResearch } = await import('@/lib/research/retrieve');
		researchRecords = selectRelevantResearch(
			await getAgentStore().listResearch(job.userId, brain.id),
			`${payload.topic ?? ''} ${payload.instruction ?? ''}`,
		);
	}
	const startedAt = new Date().toISOString();
	const onStage = async (stage: string) => {
		if (!priorId) return;
		await updateArticle(job.userId, priorId, (article) => {
			const generation = article.workspace!.generation;
			article.workspace!.generation = {
				...generation,
				jobId: job.id,
				status: 'processing',
				stage,
				startedAt: generation.startedAt && generation.jobId === job.id ? generation.startedAt : startedAt,
				updatedAt: new Date().toISOString(),
				error: null,
			};
		});
	};
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
		research,
		brief,
		articleId: priorId,
		destinationId: payload.destinationId,
		primaryKeyword: payload.primaryKeyword,
		audience: payload.audience,
		searchIntent: payload.searchIntent,
		contentType: payload.contentType,
		skipAutoRevision: payload.skipAutoRevision,
		onStage,
	});
	if (article.workspace) article.workspace.generation.jobId = job.id;
	await getNativeContentStore().saveArticle(article);
	return { articleId: article.id };
}

export async function noteGenerationFailure(job: WorkflowJob, message: string): Promise<void> {
	const articleId = (job.payload as ArticleGenerationJobPayload).articleId;
	if (!articleId) return;
	await updateArticle(job.userId, articleId, (article) => {
		article.workspace!.generation = {
			...article.workspace!.generation,
			status: 'failed',
			error: message,
			jobId: job.id,
			stage: 'Failed',
			updatedAt: new Date().toISOString(),
		};
	});
}

export async function runArticleRevisionJob(job: WorkflowJob): Promise<ArticleRevisionJobResult> {
	const payload = job.payload as ArticleRevisionJobPayload;
	if (payload.result) return payload.result;
	const store = getIntelligenceStore();
	const content = getNativeContentStore();
	const article = await content.getArticle(job.userId, payload.articleId);
	if (!article) throw new Error('Article not found.');
	const workspace = ensureWorkspace(article);
	article.workspace = workspace;
	if (workspace.revision?.id !== payload.baseRevisionId) {
		throw new Error('The article changed after this revision was requested. Nothing was applied. Apply again on the current revision.');
	}
	const brain = (await store.getBrandBrainById(job.userId, payload.brandId)) ?? (await store.getBrandBrain(job.userId, payload.brandId));
	if (!brain) throw new Error('Brand not found.');
	const findings = workspace.editorial.findings.filter((finding) => payload.findingIds.includes(finding.id) && finding.decision === 'accepted');
	if (!findings.length) throw new Error('None of the requested recommendations are still accepted.');
	const startedAt = new Date().toISOString();
	const setStage = async (stage: string) => {
		await updateArticle(job.userId, article.id, (current) => {
			current.workspace!.revisionJob = {
				...(current.workspace!.revisionJob ?? { baseRevisionId: payload.baseRevisionId, resultRevisionId: null }),
				jobId: job.id,
				status: 'processing',
				stage,
				startedAt: current.workspace!.revisionJob?.startedAt ?? startedAt,
				updatedAt: new Date().toISOString(),
				error: null,
				baseRevisionId: payload.baseRevisionId,
				resultRevisionId: null,
			};
		});
	};
	await setStage(`Applying ${findings.length} accepted recommendation${findings.length === 1 ? '' : 's'} to revision ${workspace.revision.number}`);
	const fresh = (await content.getArticle(job.userId, article.id)) ?? article;
	fresh.workspace = ensureWorkspace(fresh);
	if (fresh.workspace.revision?.id !== payload.baseRevisionId) {
		throw new Error('The article changed while the revision was starting. Nothing was applied.');
	}
	const outcome = await applyArticleRevision({ ownerUserId: job.userId, article: fresh, brand: brain, findings });
	const revised = outcome.article;
	const ws = ensureWorkspace(revised);
	const newRevision = ws.revision!;
	const now = new Date().toISOString();
	const notApplied = new Map(outcome.notApplied.map((item) => [item.id, item.reason]));
	for (const finding of ws.editorial.findings) {
		const applied = outcome.applied.find((item) => item.id === finding.id);
		if (applied) {
			finding.decision = 'applied';
			finding.appliedInRevisionId = newRevision.id;
			finding.decidedAt = now;
			finding.note = applied.change;
		} else if (notApplied.has(finding.id)) {
			finding.note = `Not applied in revision ${newRevision.number}: ${notApplied.get(finding.id)}`;
		}
	}
	ws.editorial.cyclesUsed += 1;
	ws.revisionJob = { ...ws.revisionJob!, stage: `Reviewing revision ${newRevision.number}`, updatedAt: now, status: 'processing' };
	revised.workspace = ws;
	revised.approval = { required: true, approver: 'human', status: 'pending' };
	if (revised.status === 'approved') revised.status = 'review';
	revised.updatedAt = now;
	await content.saveArticle(revised);

	const carried = ws.editorial.findings.filter((finding) => finding.decision === 'accepted' && notApplied.has(finding.id));
	const taxonomy = ws.destinationId ? await loadDestinationTaxonomy(ws.destinationId) : null;
	await reviewCurrentRevision({ article: revised, brain, taxonomy, ai: getIntelligenceAi(), ownerUserId: job.userId });
	const reviewed = ensureWorkspace(revised);
	for (const finding of carried) {
		if (reviewed.editorial.findings.some((item) => item.code === finding.code && isOpenFinding(item))) continue;
		reviewed.editorial.findings.push({ ...finding, revisionId: newRevision.id });
	}
	reviewed.editorial.status = editorialStatusFromFindings(reviewed.editorial.findings, reviewed.editorial.exhausted);
	const result: ArticleRevisionJobResult = {
		articleId: revised.id,
		baseRevisionId: payload.baseRevisionId,
		resultRevisionId: newRevision.id,
		applied: outcome.applied,
		notApplied: outcome.notApplied,
	};
	reviewed.revisionJob = {
		...reviewed.revisionJob!,
		status: 'completed',
		stage: `Revision ${newRevision.number} saved and reviewed`,
		updatedAt: new Date().toISOString(),
		resultRevisionId: newRevision.id,
		error: null,
	};
	revised.workspace = reviewed;
	revised.updatedAt = new Date().toISOString();
	await content.saveArticle(revised);
	return result;
}

export async function noteRevisionFailure(job: WorkflowJob, message: string): Promise<void> {
	const payload = job.payload as ArticleRevisionJobPayload;
	await updateArticle(job.userId, payload.articleId, (article) => {
		article.workspace!.revisionJob = {
			...(article.workspace!.revisionJob ?? { baseRevisionId: payload.baseRevisionId, resultRevisionId: null, startedAt: null }),
			jobId: job.id,
			status: 'failed',
			stage: 'Failed',
			updatedAt: new Date().toISOString(),
			error: message,
			baseRevisionId: payload.baseRevisionId,
			resultRevisionId: null,
			startedAt: article.workspace!.revisionJob?.startedAt ?? null,
		};
	});
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

async function runClaimed(jobId: string, run: (job: WorkflowJob) => Promise<object>, onFailure: (job: WorkflowJob, message: string) => Promise<void>): Promise<void> {
	const store = getIntelligenceStore();
	const job = await store.claimJobById(jobId);
	if (!job) return;
	try {
		const result = await run(job);
		await store.updateJob(job.id, {
			status: 'completed',
			completedAt: new Date().toISOString(),
			payload: { ...job.payload, result },
			lastError: undefined,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'The article job failed';
		await store.updateJob(job.id, {
			status: 'failed',
			completedAt: new Date().toISOString(),
			lastError: message,
		});
		await onFailure(job, message);
		throw error;
	}
}

export async function runArticleGenerationInline(jobId: string): Promise<void> {
	await runClaimed(jobId, runArticleGenerationJob, noteGenerationFailure);
}

export async function runArticleRevisionInline(jobId: string): Promise<void> {
	await runClaimed(jobId, runArticleRevisionJob, noteRevisionFailure);
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
