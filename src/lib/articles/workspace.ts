import 'server-only';

import { countWords } from '@/lib/ai/truncation';
import { resolveModelForRole } from '@/lib/ai/roles';
import { DEFAULT_RATE_LIMIT } from '@/lib/agent/policy';
import type { ResearchRecord } from '@/lib/agent/types';
import { getIntelligenceAi, getIntelligenceStore } from '@/lib/intelligence/actions';
import { mergeEditorialReviews, runDeterministicArticleReview, runLlmEditorialReview } from '@/lib/articles/editorialReview';
import {
	articleGenerationJobIsStale,
	dispatchArticleGenerationWorker,
	enqueueArticleGenerationJob,
	noteGenerationFailure,
	runArticleGenerationInline,
	type ArticleGenerationJobPayload,
} from '@/lib/articles/generationJob';
import { articleGenerationRunsInline } from '@/lib/ai/longFormConfig';
import {
	articleApprovalGate,
	articleNextStep,
	articleScheduleGate,
	editorialStatusFromFindings,
	emptyWorkspace,
	ensureWorkspace,
	imagesRequired,
	matchingTools,
	normaliseExternalId,
	recommendArticleStructure,
	relatedArticleSlugs,
	reviewCycleLimit,
	toEditorialFindings,
	toListItem,
	matchesArticleView,
	type ArticleListItem,
} from '@/lib/articles/meta';
import { normaliseTargetWords, reviseArticle } from '@/lib/articles/pipeline';
import type { ArticleRecord } from '@/lib/articles/types';
import { generateAssetFromProposal } from '@/lib/media/images';
import { planMedia } from '@/lib/media/planner';
import { getNativeContentStore } from '@/lib/media/store';
import { classifyArticleForDestination } from '@/lib/publishing/classifyForDestination';
import { assertDestinationCategory } from '@/lib/publishing/destinationTaxonomy';
import { fetchFolianDraftRevision, submitFolianDraftFromRecord } from '@/lib/publishing/folian';
import { fetchAllowedImage } from '@/lib/publishing/folianClient';
import { taxonomyForDestination, websitePublishingEnabled } from '@/lib/publishing/websiteDestinations';
import { executeResearch } from '@/lib/research/service';
import { selectSearchProvider } from '@/lib/research/search';

export class ArticleWorkflowError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code: string,
	) {
		super(message);
	}
}

function slugify(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'article';
}

async function requireBrand(ownerUserId: string, brandId: string) {
	const brain = await getIntelligenceStore().getBrandBrainById(ownerUserId, brandId);
	if (!brain) throw new ArticleWorkflowError('Brand not found.', 404, 'brand_not_found');
	return brain;
}

async function requireArticle(ownerUserId: string, articleId: string) {
	const article = await getNativeContentStore().getArticle(ownerUserId, articleId);
	if (!article) throw new ArticleWorkflowError('Article not found.', 404, 'article_not_found');
	article.workspace = ensureWorkspace(article);
	return article;
}

async function persist(article: ArticleRecord) {
	article.updatedAt = new Date().toISOString();
	article.workspace = ensureWorkspace(article);
	return getNativeContentStore().saveArticle(article);
}

export async function listWorkspaceArticles(ownerUserId: string, input?: { brandId?: string; view?: string }): Promise<ArticleListItem[]> {
	const articles = await getNativeContentStore().listArticles(ownerUserId, input?.brandId);
	const view = input?.view || 'all';
	return articles.filter((article) => matchesArticleView(article, view)).map(toListItem);
}

export async function listFailedArticleJobs(ownerUserId: string, brandId?: string) {
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, brandId);
	return jobs
		.filter((job) => job.jobType === 'article_generation' && job.status === 'failed')
		.map((job) => ({
			jobId: job.id,
			brandId: job.brandBrainId ?? null,
			articleId: (job.payload as ArticleGenerationJobPayload).articleId ?? null,
			error: job.lastError ?? 'Article generation failed',
			createdAt: job.createdAt,
			completedAt: job.completedAt ?? null,
		}));
}

async function launchArticleGeneration(jobId: string): Promise<void> {
	if (articleGenerationRunsInline()) {
		await dispatchArticleGenerationWorker(jobId);
		return;
	}
	const { after } = await import('next/server');
	after(async () => {
		try {
			await runArticleGenerationInline(jobId);
		} catch (error) {
			console.error('[article_generation]', jobId, error);
		}
	});
}

async function releaseStaleGeneration(ownerUserId: string, articleId: string) {
	const jobs = await getIntelligenceStore().listJobs(ownerUserId);
	const active = jobs.find((job) => {
		const payload = job.payload as ArticleGenerationJobPayload;
		return job.jobType === 'article_generation' && payload.articleId === articleId && (job.status === 'queued' || job.status === 'processing' || job.status === 'retrying');
	});
	if (!active || !articleGenerationJobIsStale(active)) return;
	const message = active.status === 'processing'
		? 'Generation exceeded the execution limit. Retry keeps this article.'
		: 'The generation worker did not start. Retry keeps this article.';
	await getIntelligenceStore().updateJob(active.id, {
		status: 'failed',
		lastError: message,
		completedAt: new Date().toISOString(),
	});
	await noteGenerationFailure(active, message);
}

export async function getWorkspaceArticle(ownerUserId: string, articleId: string) {
	await releaseStaleGeneration(ownerUserId, articleId);
	const article = await requireArticle(ownerUserId, articleId);
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, article.brandId);
	const job = jobs.find((item) => {
		const payload = item.payload as ArticleGenerationJobPayload & { result?: { articleId?: string } };
		return payload.articleId === article.id || payload.result?.articleId === article.id;
	});
	return {
		article,
		nextStep: articleNextStep(article),
		model: {
			role: article.workspace?.assignedModelRole ?? 'LONG_FORM_WRITING',
			resolved: resolveModelForRole('LONG_FORM_WRITING'),
		},
		job: job
			? { id: job.id, status: job.status, error: job.lastError ?? null, createdAt: job.createdAt, completedAt: job.completedAt ?? null }
			: null,
	};
}

export type ArticleBriefInput = {
	brandId: string;
	destinationId?: string;
	topic: string;
	workingTitle?: string;
	primaryKeyword?: string;
	searchIntent?: string;
	audience?: string;
	contentType?: string;
	targetWords?: number;
	researchRequirements?: string;
	internalLinking?: string;
	imageRequirements?: string;
	externalId?: string;
};

export async function createArticleBrief(ownerUserId: string, input: ArticleBriefInput): Promise<ArticleRecord> {
	const topic = input.topic.trim();
	if (!topic) throw new ArticleWorkflowError('A topic is required.', 400, 'invalid_input');
	const brain = await requireBrand(ownerUserId, input.brandId);
	let externalId: string | null = null;
	if (input.externalId?.trim()) {
		try {
			externalId = normaliseExternalId(input.externalId);
		} catch (error) {
			throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Invalid external ID.', 400, 'invalid_external_id');
		}
	}
	if (externalId) {
		const existing = (await getNativeContentStore().listArticles(ownerUserId, brain.id)).find(
			(article) => article.workspace?.externalId === externalId || article.workspace?.cms.externalId === externalId,
		);
		if (existing) return existing;
	}
	const title = input.workingTitle?.trim() || topic;
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const slug = slugify(title);
	const workspace = emptyWorkspace({
		destinationId: input.destinationId?.trim() || null,
		contentType: input.contentType?.trim() || 'guide',
		workingTitle: title,
		researchRequirements: input.researchRequirements?.trim() ?? '',
		internalLinking: input.internalLinking?.trim() ?? '',
		imageRequirements: input.imageRequirements?.trim() ?? '',
		externalId,
		researchSummary: {
			retrievedAt: null,
			competitors: [],
			recommendedStructure: recommendArticleStructure(topic, []),
			relatedArticleSlugs: [],
			relatedTools: [],
			searchIntent: input.searchIntent?.trim() || '',
		},
	});
	workspace.cms.externalId = externalId;
	const article: ArticleRecord = {
		id,
		ownerUserId,
		brandId: brain.id,
		objective: topic,
		audience: input.audience?.trim(),
		topic,
		searchIntent: input.searchIntent?.trim() || 'informational',
		primaryKeyword: input.primaryKeyword?.trim(),
		secondaryTopics: [],
		research: {
			sources: [{ label: 'Brand Brain', kind: 'brand_brain' }],
			claims: (brain.knowledge.brandFacts ?? []).slice(0, 8).map((text) => ({ text, sourceLabel: 'Brand Brain', confidence: 'stored' as const })),
			gaps: input.researchRequirements?.trim() ? [input.researchRequirements.trim()] : [],
			usedExternalResearch: false,
		},
		outline: workspace.researchSummary.recommendedStructure,
		sections: [],
		title,
		slug,
		excerpt: '',
		body: '',
		seo: {
			title,
			seoTitle: title,
			slug,
			excerpt: '',
			metaDescription: '',
			canonical: null,
			primaryKeyword: input.primaryKeyword?.trim() ?? null,
			secondaryTopics: [],
		},
		author: null,
		categories: [],
		tags: [],
		inlineAssetIds: [],
		mediaPlan: null,
		internalLinkOpportunities: [],
		status: 'brief',
		approval: { required: true, approver: 'human', status: 'pending' },
		publishDestination: workspace.destinationId ?? undefined,
		publication: null,
		performanceContentId: id,
		wordCount: 0,
		targetWords: normaliseTargetWords(input.targetWords),
		review: null,
		versions: [],
		distribution: { disclosure: null, sponsorship: 'none', contentCluster: null, authorProfileId: null },
		createdAt: now,
		updatedAt: now,
		workspace,
	};
	return persist(article);
}

export async function saveArticleDraft(
	ownerUserId: string,
	articleId: string,
	patch: Partial<ArticleBriefInput> & { body?: string; title?: string },
): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (patch.topic?.trim()) article.topic = patch.topic.trim();
	if (patch.workingTitle?.trim() || patch.title?.trim()) {
		article.title = (patch.title ?? patch.workingTitle)!.trim();
		workspace.workingTitle = article.title;
		article.slug = slugify(article.title);
		article.seo.title = article.title;
		article.seo.seoTitle = article.title;
		article.seo.slug = article.slug;
	}
	if (patch.primaryKeyword !== undefined) {
		article.primaryKeyword = patch.primaryKeyword.trim();
		article.seo.primaryKeyword = patch.primaryKeyword.trim() || null;
	}
	if (patch.searchIntent?.trim()) {
		article.searchIntent = patch.searchIntent.trim();
		workspace.researchSummary.searchIntent = article.searchIntent;
	}
	if (patch.audience !== undefined) article.audience = patch.audience.trim();
	if (patch.contentType?.trim()) workspace.contentType = patch.contentType.trim();
	if (patch.destinationId !== undefined) {
		workspace.destinationId = patch.destinationId.trim() || null;
		article.publishDestination = workspace.destinationId ?? undefined;
	}
	if (patch.researchRequirements !== undefined) workspace.researchRequirements = patch.researchRequirements;
	if (patch.internalLinking !== undefined) workspace.internalLinking = patch.internalLinking;
	if (patch.imageRequirements !== undefined) workspace.imageRequirements = patch.imageRequirements;
	if (patch.targetWords) article.targetWords = normaliseTargetWords(patch.targetWords);
	if (typeof patch.body === 'string') {
		article.versions.push({ body: article.body, createdAt: article.updatedAt, instruction: 'Manual edit' });
		article.body = patch.body;
		article.wordCount = countWords(patch.body);
		article.approval = { required: true, approver: 'human', status: 'pending' };
		if (article.status === 'approved' || article.status === 'published') article.status = 'draft';
		workspace.editorial.status = 'not_run';
		workspace.editorial.exhausted = false;
	}
	article.workspace = workspace;
	return persist(article);
}

export async function researchArticle(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const provider = selectSearchProvider();
	const query = [article.topic, article.primaryKeyword, article.workspace?.researchRequirements].filter(Boolean).join('. ');
	const record: ResearchRecord = await executeResearch({
		ownerUserId,
		brandId: brain.id,
		brandName: brain.identity.name,
		website: brain.identity.website,
		query,
		projectType: 'ARTICLE_RESEARCH',
		brandFacts: brain.knowledge.brandFacts,
		search: provider.configured ? provider : { name: provider.name, configured: false, async search() { return []; } },
	});
	const packetSources = (record.packet?.sources ?? []).filter((source) => source.url && !source.rejected);
	const storedSources = record.sources.filter((source) => source.url);
	const sources = (packetSources.length ? packetSources : storedSources).map((source) => ({
		label: source.title || source.url || 'Source',
		kind: 'supplied' as const,
		url: source.url,
		retrievedAt: source.retrievedAt,
	}));
	const claims = record.claims
		.filter((claim) => claim.text && claim.sourceUrl)
		.map((claim) => ({ text: claim.text, sourceLabel: claim.sourceUrl as string, confidence: 'supplied' as const }));
	const findingTexts = (record.packet?.findings ?? [])
		.filter((finding) => finding.text && finding.sourceIds.length > 0)
		.map((finding) => finding.text);
	const workspace = ensureWorkspace(article);
	const taxonomy = workspace.destinationId ? await taxonomyForDestination(workspace.destinationId) : null;
	const siblings = await getNativeContentStore().listArticles(ownerUserId, article.brandId);
	workspace.researchId = record.id;
	workspace.researchSummary = {
		retrievedAt: record.createdAt,
		competitors: (record.packet?.competitors ?? []).map((competitor) => ({
			name: competitor.name,
			website: competitor.website,
			claims: competitor.claims,
		})),
		recommendedStructure: recommendArticleStructure(article.topic, findingTexts),
		relatedArticleSlugs: relatedArticleSlugs(siblings, article.id, article.topic),
		relatedTools: matchingTools(taxonomy, `${article.topic} ${article.primaryKeyword ?? ''}`),
		searchIntent: article.searchIntent,
	};
	article.research = {
		sources: [{ label: 'Brand Brain', kind: 'brand_brain' }, ...sources],
		claims: [
			...(brain.knowledge.brandFacts ?? []).slice(0, 8).map((text) => ({ text, sourceLabel: 'Brand Brain', confidence: 'stored' as const })),
			...claims,
		],
		gaps: record.packet?.gaps?.length ? record.packet.gaps : sources.length ? [] : ['No external source with a URL was retrieved.'],
		usedExternalResearch: sources.length > 0,
	};
	article.outline = workspace.researchSummary.recommendedStructure;
	article.internalLinkOpportunities = [
		...workspace.researchSummary.relatedArticleSlugs,
		...workspace.researchSummary.relatedTools.map((tool) => tool.slug),
	];
	article.workspace = workspace;
	return persist(article);
}

export async function approveArticleBrief(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.title.trim() || !article.topic.trim()) {
		throw new ArticleWorkflowError('Add a topic and working title before approving the brief.', 400, 'brief_incomplete');
	}
	const workspace = ensureWorkspace(article);
	workspace.briefApprovedAt = new Date().toISOString();
	if (workspace.researchSummary.recommendedStructure.length) {
		article.outline = workspace.researchSummary.recommendedStructure;
	}
	article.workspace = workspace;
	return persist(article);
}

export async function startArticleGeneration(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; jobId: string }> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.briefApprovedAt) {
		throw new ArticleWorkflowError('Approve the brief before generating a draft.', 400, 'brief_not_approved');
	}
	await releaseStaleGeneration(ownerUserId, article.id);
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, article.brandId);
	const active = jobs.find((job) => {
		const payload = job.payload as ArticleGenerationJobPayload;
		return job.jobType === 'article_generation' && payload.articleId === article.id && (job.status === 'queued' || job.status === 'processing' || job.status === 'retrying');
	});
	if (active && !articleGenerationJobIsStale(active)) {
		throw new ArticleWorkflowError('A generation job is already running for this article.', 409, 'generation_in_progress');
	}
	const job = await enqueueArticleGenerationJob({
		ownerUserId,
		brandBrainId: article.brandId,
		payload: {
			brandId: article.brandId,
			articleId: article.id,
			topic: article.topic,
			objective: article.objective,
			instruction: [workspace.researchRequirements, workspace.internalLinking, article.outline.map((item) => item.heading).join('; ')].filter(Boolean).join('\n'),
			targetWords: article.targetWords,
			destinationId: workspace.destinationId ?? undefined,
			primaryKeyword: article.primaryKeyword,
			audience: article.audience,
			searchIntent: article.searchIntent,
			contentType: workspace.contentType,
			skipAutoRevision: true,
		},
	});
	workspace.generation.jobId = job.id;
	workspace.generation.status = 'queued';
	workspace.generation.error = null;
	workspace.assignedModel = resolveModelForRole('LONG_FORM_WRITING');
	article.workspace = workspace;
	await persist(article);
	try {
		await launchArticleGeneration(job.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Article generation failed';
		await noteGenerationFailure(job, message);
		throw new ArticleWorkflowError(message, 502, 'generation_failed');
	}
	return { article: await requireArticle(ownerUserId, articleId), jobId: job.id };
}

export async function retryArticleGeneration(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; jobId: string }> {
	const article = await requireArticle(ownerUserId, articleId);
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, article.brandId);
	const failed = jobs.find((job) => job.jobType === 'article_generation' && (job.payload as ArticleGenerationJobPayload).articleId === article.id && job.status === 'failed');
	if (!failed) return startArticleGeneration(ownerUserId, articleId);
	const payload = { ...(failed.payload as ArticleGenerationJobPayload) };
	delete (payload as { result?: unknown }).result;
	await getIntelligenceStore().updateJob(failed.id, { status: 'queued', lastError: undefined, payload, completedAt: undefined });
	const workspace = ensureWorkspace(article);
	workspace.generation.status = 'queued';
	workspace.generation.error = null;
	workspace.generation.jobId = failed.id;
	article.workspace = workspace;
	await persist(article);
	try {
		await launchArticleGeneration(failed.id);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Article generation failed';
		await noteGenerationFailure({ ...failed, payload }, message);
		throw new ArticleWorkflowError(message, 502, 'generation_failed');
	}
	return { article: await requireArticle(ownerUserId, articleId), jobId: failed.id };
}

export async function reviewArticle(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.body.trim()) throw new ArticleWorkflowError('Generate a draft before review.', 400, 'draft_missing');
	const brain = await requireBrand(ownerUserId, article.brandId);
	const workspace = ensureWorkspace(article);
	const taxonomy = workspace.destinationId ? await taxonomyForDestination(workspace.destinationId) : null;
	const categoryId = article.categories[0] ?? taxonomy?.categories[0]?.id ?? 'general';
	const standards = taxonomy ?? {
		destination: workspace.destinationId ?? 'generic',
		schemaVersion: 1,
		categoryCreationPolicy: 'open' as const,
		categories: [{ id: categoryId, name: categoryId, description: categoryId }],
		contentTypes: [workspace.contentType],
		tags: { policy: 'open' as const },
		tools: [],
	};
	const deterministic = runDeterministicArticleReview({
		body: article.body,
		wordCount: article.wordCount,
		targetWords: article.targetWords,
		categoryId,
		taxonomy: standards,
		sourceCount: article.research.sources.filter((source) => source.url).length,
		claimsExternalResearch: article.research.usedExternalResearch === true,
		toolSlugs: workspace.researchSummary.relatedTools.map((tool) => tool.slug),
	});
	const llm = await runLlmEditorialReview({
		ai: getIntelligenceAi(),
		ownerUserId,
		brain,
		topic: article.topic,
		searchIntent: article.searchIntent,
		body: article.body,
		categoryId,
	});
	const merged = mergeEditorialReviews(deterministic, llm);
	const findings = toEditorialFindings(merged.findings);
	const exhausted = workspace.editorial.cyclesUsed >= reviewCycleLimit() && !merged.ready;
	workspace.editorial = {
		...workspace.editorial,
		status: editorialStatusFromFindings(findings, exhausted),
		maxCycles: reviewCycleLimit(),
		findings,
		lastRunAt: new Date().toISOString(),
		exhausted,
	};
	article.review = {
		materialPassed: false,
		note: merged.ready ? 'Editorial review found no critical issues. A person still has to approve.' : 'Editorial review found issues. Exhausting review attempts does not approve the article.',
		coherenceFindings: findings.map((finding) => `${finding.dimension}:${finding.code}`),
	};
	article.workspace = workspace;
	if (article.status === 'approved') {
		article.status = 'review';
		article.approval = { required: true, approver: 'human', status: 'pending' };
	}
	return persist(article);
}

export async function decideRecommendation(ownerUserId: string, articleId: string, findingId: string, decision: 'accepted' | 'rejected'): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const finding = workspace.editorial.findings.find((item) => item.id === findingId);
	if (!finding) throw new ArticleWorkflowError('Recommendation not found.', 404, 'finding_not_found');
	finding.decision = decision;
	article.workspace = workspace;
	return persist(article);
}

export async function requestArticleRevision(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (workspace.editorial.cyclesUsed >= workspace.editorial.maxCycles) {
		workspace.editorial.exhausted = true;
		workspace.editorial.status = workspace.editorial.status === 'ready' ? 'ready' : 'blocked';
		article.workspace = workspace;
		article.approval = { required: true, approver: 'human', status: 'pending' };
		await persist(article);
		throw new ArticleWorkflowError('The review cycle limit is used up. That is not approval.', 409, 'review_not_approval');
	}
	const accepted = workspace.editorial.findings.filter((finding) => finding.decision === 'accepted');
	if (!accepted.length) {
		throw new ArticleWorkflowError('Accept at least one recommendation, or edit the draft manually.', 400, 'no_accepted_recommendations');
	}
	const brain = await requireBrand(ownerUserId, article.brandId);
	const revised = await reviseArticle({
		ownerUserId,
		article,
		brand: brain,
		instruction: accepted.map((finding) => finding.instruction).join('\n'),
	});
	const next = ensureWorkspace(revised);
	next.editorial.cyclesUsed += 1;
	next.editorial.exhausted = next.editorial.cyclesUsed >= next.editorial.maxCycles && next.editorial.findings.some((finding) => finding.severity === 'critical' && finding.decision !== 'rejected');
	next.editorial.status = 'not_run';
	revised.workspace = next;
	revised.approval = { required: true, approver: 'human', status: 'pending' };
	if (revised.status === 'approved' || revised.status === 'published') revised.status = 'draft';
	return persist(revised);
}

export async function classifyWorkspaceArticle(ownerUserId: string, articleId: string, categoryId?: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) throw new ArticleWorkflowError('Choose a website destination before classifying.', 400, 'destination_required');
	const taxonomy = await taxonomyForDestination(workspace.destinationId);
	if (!taxonomy) throw new ArticleWorkflowError('This destination has no taxonomy.', 422, 'taxonomy_unavailable');
	if (categoryId) {
		article.categories = [assertDestinationCategory(taxonomy, categoryId)];
	} else {
		const classification = await classifyArticleForDestination({
			ai: getIntelligenceAi(),
			ownerUserId,
			topic: `${article.topic} ${article.title}`,
			searchIntent: article.searchIntent,
			audience: article.audience,
			objective: article.objective,
			taxonomy,
		});
		article.categories = [assertDestinationCategory(taxonomy, classification.categoryId)];
		if (taxonomy.contentTypes.includes(classification.contentType)) workspace.contentType = classification.contentType;
		article.tags = classification.tags;
		workspace.researchSummary.relatedTools = taxonomy.tools
			.filter((tool) => classification.toolSlugs.includes(tool.slug))
			.map((tool) => ({ slug: tool.slug, label: tool.label }));
	}
	if (workspace.contentType && !taxonomy.contentTypes.includes(workspace.contentType)) {
		throw new ArticleWorkflowError('That content type is not valid for this destination.', 400, 'invalid_content_type');
	}
	article.workspace = workspace;
	return persist(article);
}

async function verifyMediaUrl(url: string | undefined): Promise<{ ok: boolean; error: string | null }> {
	if (!url) return { ok: false, error: 'The image has no delivery URL.' };
	const fetched = await fetchAllowedImage(url);
	return fetched.ok ? { ok: true, error: null } : { ok: false, error: fetched.error };
}

export async function generateArticleMedia(ownerUserId: string, articleId: string, role: 'hero' | 'og'): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const decision = planMedia({ channel: 'BLOG', topic: article.topic, objective: article.objective, contentType: 'article' });
	const generated = await generateAssetFromProposal({
		ownerUserId,
		credentialId: 'ui-session',
		brandId: brain.id,
		targetType: 'article',
		targetId: role === 'og' ? `${article.id}:og` : article.id,
		decision,
		rateLimit: DEFAULT_RATE_LIMIT,
		brand: brain,
		channel: 'BLOG',
		topic: article.topic,
		excerpt: article.excerpt || article.body.slice(0, 400),
		explicitRequest: true,
	});
	const workspace = ensureWorkspace(article);
	const url = generated.asset.url ?? null;
	const verified = await verifyMediaUrl(url ?? undefined);
	if (role === 'hero') {
		workspace.media.heroAssetId = generated.asset.id;
		workspace.media.heroUrl = url;
		workspace.media.heroAlt = workspace.media.heroAlt || generated.asset.altText || article.title;
		article.featuredAssetId = generated.asset.id;
		workspace.media.deliveryVerified = verified.ok;
		workspace.media.deliveryError = verified.error;
	} else {
		workspace.media.ogAssetId = generated.asset.id;
		workspace.media.ogUrl = url;
		workspace.media.ogAlt = workspace.media.ogAlt || generated.asset.altText || article.title;
	}
	article.workspace = workspace;
	return persist(article);
}

export async function replaceArticleMedia(ownerUserId: string, articleId: string, assetId: string, role: 'hero' | 'og'): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const asset = await getNativeContentStore().getAsset(ownerUserId, assetId);
	if (!asset || asset.brandId !== article.brandId) {
		throw new ArticleWorkflowError('That image is not in this brand library.', 404, 'asset_not_found');
	}
	const workspace = ensureWorkspace(article);
	const verified = await verifyMediaUrl(asset.url);
	if (role === 'hero') {
		workspace.media.heroAssetId = asset.id;
		workspace.media.heroUrl = asset.url ?? null;
		workspace.media.heroAlt = asset.altText || workspace.media.heroAlt || article.title;
		article.featuredAssetId = asset.id;
		workspace.media.deliveryVerified = verified.ok;
		workspace.media.deliveryError = verified.error;
	} else {
		workspace.media.ogAssetId = asset.id;
		workspace.media.ogUrl = asset.url ?? null;
		workspace.media.ogAlt = asset.altText || article.title;
	}
	article.workspace = workspace;
	return persist(article);
}

export async function updateArticleMediaMeta(
	ownerUserId: string,
	articleId: string,
	meta: { heroAlt?: string; ogAlt?: string; credit?: string; license?: string },
): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (meta.heroAlt !== undefined) workspace.media.heroAlt = meta.heroAlt;
	if (meta.ogAlt !== undefined) workspace.media.ogAlt = meta.ogAlt;
	if (meta.credit !== undefined) workspace.media.credit = meta.credit;
	if (meta.license !== undefined) workspace.media.license = meta.license;
	const assetId = workspace.media.heroAssetId;
	if (assetId) {
		const asset = await getNativeContentStore().getAsset(ownerUserId, assetId);
		if (asset) {
			asset.altText = workspace.media.heroAlt || asset.altText;
			asset.rightsNotes = [workspace.media.credit, workspace.media.license].filter(Boolean).join(' · ') || asset.rightsNotes;
			await getNativeContentStore().saveAsset(asset);
		}
	}
	article.workspace = workspace;
	return persist(article);
}

export async function submitArticleDraft(ownerUserId: string, articleId: string, mode: 'create' | 'update'): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (workspace.destinationId !== 'folian') {
		throw new ArticleWorkflowError('Draft submission is available for a connected Payload destination. Folian is the first adapter.', 422, 'destination_unsupported');
	}
	const externalId = workspace.externalId || workspace.cms.externalId;
	if (!externalId) throw new ArticleWorkflowError('An external ID is required so the CMS can update the same draft.', 400, 'external_id_required');
	if (!article.categories[0]) throw new ArticleWorkflowError('Select a destination category before sending the draft.', 400, 'category_required');
	if (!article.body.trim()) throw new ArticleWorkflowError('There is no draft to send.', 400, 'draft_missing');
	let revision = workspace.cms.revision ?? null;
	if (revision == null) revision = await fetchFolianDraftRevision(externalId);
	const cmsMode = mode === 'update' || revision != null ? 'proposal' : 'update';
	const hero = workspace.media.heroUrl && workspace.media.deliveryVerified ? workspace.media.heroUrl : undefined;
	const result = await submitFolianDraftFromRecord(article, {
		externalId,
		baseRevision: revision ?? undefined,
		mode: cmsMode,
		heroImageUrl: hero,
		heroAlt: workspace.media.heroAlt || article.title,
		ogImageUrl: workspace.media.ogUrl && workspace.media.ogUrl !== workspace.media.heroUrl ? workspace.media.ogUrl : undefined,
		ogAlt: workspace.media.ogAlt || article.title,
	});
	workspace.cms.externalId = externalId;
	workspace.externalId = externalId;
	workspace.cms.lastSyncAt = new Date().toISOString();
	workspace.cms.mode = cmsMode;
	if (!result.ok) {
		workspace.cms.lastError = result.error ?? 'The CMS rejected the draft.';
		article.workspace = workspace;
		await persist(article);
		throw new ArticleWorkflowError(workspace.cms.lastError, 422, 'cms_rejected');
	}
	workspace.cms.lastError = null;
	workspace.cms.draftUrl = result.previewUrl ?? result.url ?? null;
	if (typeof result.revision === 'number') workspace.cms.revision = result.revision;
	article.workspace = workspace;
	return persist(article);
}

export async function requestArticleApproval(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.body.trim()) throw new ArticleWorkflowError('Generate a draft before requesting approval.', 400, 'draft_missing');
	article.status = 'review';
	article.approval = { required: true, approver: 'human', status: 'pending' };
	return persist(article);
}

export async function approveWorkspaceArticle(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const gate = articleApprovalGate(article);
	if (!gate.ok) throw new ArticleWorkflowError(gate.message, 409, gate.code);
	const workspace = ensureWorkspace(article);
	if (imagesRequired(workspace.imageRequirements) && !workspace.media.deliveryVerified) {
		throw new ArticleWorkflowError('Verify destination media delivery before approving this article.', 409, 'media_not_verified');
	}
	article.status = 'approved';
	article.approval = { required: true, approver: 'human', status: 'approved' };
	article.workspace = workspace;
	return persist(article);
}

export async function publishWorkspaceArticle(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; published: false; message: string }> {
	const article = await requireArticle(ownerUserId, articleId);
	if (article.approval.status !== 'approved' || article.status !== 'approved') {
		throw new ArticleWorkflowError('Publish only after a person approves the article. This did not publish.', 403, 'approval_required');
	}
	if (websitePublishingEnabled()) {
		return {
			article,
			published: false,
			message: 'Privileged website publication is flagged on, and the Folian adapter still has no live publish call. Publish the approved draft in Payload, then record the URL here.',
		};
	}
	return {
		article,
		published: false,
		message: 'Automated publication is off. Publish the approved draft in the CMS, then record the public URL.',
	};
}

export async function recordArticlePublication(ownerUserId: string, articleId: string, url: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (article.approval.status !== 'approved') {
		throw new ArticleWorkflowError('Record a public URL only after a person has approved the article.', 403, 'approval_required');
	}
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new ArticleWorkflowError('Enter a valid https URL.', 400, 'invalid_url');
	}
	if (parsed.protocol !== 'https:') throw new ArticleWorkflowError('The published URL must use https.', 400, 'invalid_url');
	const workspace = ensureWorkspace(article);
	article.publication = {
		destination: workspace.destinationId ?? 'external',
		externalId: workspace.externalId ?? undefined,
		url: parsed.toString(),
		publishedAt: new Date().toISOString(),
		method: 'external',
	};
	article.status = 'published';
	article.workspace = workspace;
	return persist(article);
}

export async function scheduleWorkspaceArticle(ownerUserId: string, articleId: string, input: { publishAt: string; destinationId?: string }): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const destinationId = input.destinationId?.trim() || workspace.destinationId || '';
	const gate = articleScheduleGate(article, { destinationId, publishAt: input.publishAt });
	if (!gate.ok) throw new ArticleWorkflowError(gate.message, 409, gate.code);
	workspace.destinationId = destinationId;
	workspace.schedule = {
		publishAt: new Date(input.publishAt).toISOString(),
		destinationId,
		approvalRequired: true,
		status: 'scheduled',
		blockedReason: null,
	};
	article.publishAt = workspace.schedule.publishAt ?? undefined;
	article.publishDestination = destinationId;
	article.workspace = workspace;
	return persist(article);
}
