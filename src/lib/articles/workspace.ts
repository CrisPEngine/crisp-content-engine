import 'server-only';

import { resolveModelForRole } from '@/lib/ai/roles';
import { AgentError } from '@/lib/agent/errors';
import { DEFAULT_RATE_LIMIT } from '@/lib/agent/policy';
import type { ResearchRecord } from '@/lib/agent/types';
import { getAgentStore } from '@/lib/agent/controlStore';
import { getIntelligenceAi, getIntelligenceStore } from '@/lib/intelligence/actions';
import {
	articleGenerationJobIsStale,
	enqueueArticleGenerationJob,
	enqueueArticleRevisionJob,
	noteGenerationFailure,
	noteRevisionFailure,
	runArticleGenerationInline,
	runArticleRevisionInline,
	type ArticleGenerationJobPayload,
	type ArticleRevisionJobPayload,
} from '@/lib/articles/generationJob';
import { articleGenerationRunsInline } from '@/lib/ai/longFormConfig';
import {
	articleApprovalGate,
	articleLifecycle,
	articleNextStep,
	articleScheduleGate,
	DEFAULT_WORD_TOLERANCE_PCT,
	emptyWorkspace,
	ensureWorkspace,
	wordTargetFor,
	imagesRequired,
	matchingTools,
	normaliseExternalId,
	openCriticalFindings,
	recommendArticleStructure,
	relatedArticleSlugs,
	splitLines,
	toListItem,
	matchesArticleView,
	type ArticleListItem,
} from '@/lib/articles/meta';
import { normaliseTargetWords, previewArticleImprovement, type ArticleImprovementPreview } from '@/lib/articles/pipeline';
import {
	applyGeneratedMetadata,
	generateArticleMetadata,
	generateArticleMetadataWithAi,
	metadataFieldIssues,
	sanitizePlainMetadata,
	slugifyTitle,
} from '@/lib/articles/seoMetadata';
import { previewStructuralRepair, type StructuralRepairPreview } from '@/lib/articles/structuralRepair';
import {
	addBrandContext,
	addUserEvidence,
	addUserSource,
	applyRelevanceVerdicts,
	approveResearch,
	briefTerms,
	editItemText,
	emptyResearchPackage,
	ensureResearchPackage,
	mergeResearchRecord,
	setItemExcluded,
	updateNotes,
	type RelevanceVerdict,
} from '@/lib/articles/researchPackage';
import { commitRevision, ensureRevision, listRevisions } from '@/lib/articles/revisions';
import { reviewCurrentRevision } from '@/lib/articles/reviewRun';
import { articleWordCount, stripCmsTitleHeading, validateArticleStructure } from '@/lib/articles/structure';
import { unlinkRepeats } from '@/lib/articles/quality';
import { withSourceClasses } from '@/lib/articles/sourceClass';
import type { ArticleBriefDetails, ArticleRecord, ArticleWorkspace, BriefSuggestion, ResearchPackage } from '@/lib/articles/types';
import { toCanonicalArticle } from '@/lib/articles/canonical';
import { validateForDestination } from '@/lib/destinations/contentCapabilities';
import { providerDefinition } from '@/lib/destinations/providers';
import { categoryFromMappings, destinationForBrand, destinationTaxonomy, DestinationError, resolveConnection } from '@/lib/destinations/service';
import type { DestinationProviderId } from '@/lib/destinations/types';
import {
	aspectRatioForRole,
	buildArticleImagePrompt,
	conceptSimilarityWarning,
	emptyMediaCreativeState,
	mergeImageBrief,
	suggestImageConcept,
	type ArticleImageRole,
	type ImageCreativeBrief,
	type MediaCreativeState,
} from '@/lib/articles/imageBrief';
import { suggestArticleTitles, type TitleSuggestion } from '@/lib/articles/titleSuggestions';
import { generateAssetFromProposal } from '@/lib/media/images';
import { planMedia } from '@/lib/media/planner';
import { runAssetVisionAnalysis } from '@/lib/media/runAssetVision';
import { getNativeContentStore } from '@/lib/media/store';
import type { MediaDecision } from '@/lib/media/types';
import { classifyArticleForDestination } from '@/lib/publishing/classifyForDestination';
import { assertDestinationCategory, type DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { mapArticleRecordToFolianDraft } from '@/lib/publishing/folianMap';
import { fetchAllowedImage } from '@/lib/publishing/folianClient';
import { websitePublishingEnabled } from '@/lib/publishing/websiteDestinations';
import { assertPublicHttpUrl } from '@/lib/research/policy';
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
	ensureRevision(article);
	return getNativeContentStore().saveArticle(article);
}

function mediaFilename(slug: string, role: 'hero' | 'og', mimeType: string): string {
	const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
	const safe = (slug || 'article').replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'article';
	return `${safe}-${role}.${extension}`;
}

function asWorkflowError(error: unknown): never {
	if (error instanceof DestinationError) throw new ArticleWorkflowError(error.message, error.status, error.code);
	throw error;
}

async function taxonomyFor(article: ArticleRecord): Promise<DestinationTaxonomy | null> {
	const destinationId = article.workspace?.destinationId;
	if (!destinationId) return null;
	try {
		return await destinationTaxonomy(article.ownerUserId, article.brandId, destinationId);
	} catch {
		return null;
	}
}

function compatibilityFor(article: ArticleRecord, taxonomy: DestinationTaxonomy | null, provider: DestinationProviderId | string) {
	const definition = providerDefinition(provider);
	const caps = definition?.content ?? null;
	const canonical = toCanonicalArticle(article, taxonomy);
	if (!caps) {
		return {
			canonical,
			issues: [{ severity: 'blocking' as const, code: 'provider_unavailable', message: 'This destination provider cannot validate content yet.', count: 1 }],
			providerLabel: definition?.label ?? provider,
			draftPreview: false,
		};
	}
	return {
		canonical,
		issues: validateForDestination(canonical, caps),
		providerLabel: definition?.label ?? provider,
		draftPreview: caps.draftPreview,
	};
}

/** Compatibility preview of how the article maps for the selected CMS. Not a live website screenshot. */
export async function destinationPreview(ownerUserId: string, articleId: string) {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) throw new ArticleWorkflowError('Choose a website destination first.', 400, 'destination_required');
	const { connection, destination } = await resolveConnection(ownerUserId, article.brandId, workspace.destinationId).catch(asWorkflowError);
	const taxonomy = await taxonomyFor(article);
	const check = compatibilityFor(article, taxonomy, destination.provider);
	const mapped = mapArticleRecordToFolianDraft(article, {
		externalId: workspace.externalId || workspace.cms.externalId || article.slug,
		mode: 'proposal',
		taxonomy: taxonomy ?? undefined,
		heroMediaId: workspace.cms.heroMediaId ?? undefined,
		ogMediaId: workspace.cms.ogMediaId ?? undefined,
	});
	return {
		label: 'CMS compatibility preview',
		note: check.draftPreview
			? `This is the structured payload CCE would send to ${destination.name}. It is not a live page render.`
			: `This destination does not expose an authenticated draft preview. Showing the mapped payload only.`,
		destination: { id: destination.id, name: destination.name, provider: destination.provider, baseUrl: connection.baseUrl },
		issues: check.issues,
		blocking: check.issues.filter((issue) => issue.severity === 'blocking'),
		canonical: check.canonical,
		mappedPayload: mapped,
	};
}

function assertNotApproved(article: ArticleRecord, action: string) {
	if (article.approval.status === 'approved' || article.status === 'published') {
		throw new ArticleWorkflowError(`${action} is blocked because the article is approved. Approved content is not changed automatically. Edit the body yourself to withdraw approval first.`, 409, 'approved_content_locked');
	}
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

async function launchJob(jobId: string, kind: 'generation' | 'revision'): Promise<void> {
	const run = kind === 'generation' ? runArticleGenerationInline : runArticleRevisionInline;
	if (articleGenerationRunsInline()) {
		await run(jobId);
		return;
	}
	const { after } = await import('next/server');
	after(async () => {
		try {
			await run(jobId);
		} catch (error) {
			console.error(`[article_${kind}]`, jobId, error);
		}
	});
}

async function releaseStaleJobs(ownerUserId: string, articleId: string) {
	const jobs = await getIntelligenceStore().listJobs(ownerUserId);
	for (const job of jobs) {
		const payload = job.payload as { articleId?: string };
		if (payload.articleId !== articleId) continue;
		if (job.jobType !== 'article_generation' && job.jobType !== 'article_revision') continue;
		if (!articleGenerationJobIsStale(job)) continue;
		const message = job.status === 'processing'
			? 'The job exceeded the execution limit. Nothing partial was saved. Retry keeps this article.'
			: 'The background worker did not start. Retry keeps this article.';
		await getIntelligenceStore().updateJob(job.id, { status: 'failed', lastError: message, completedAt: new Date().toISOString() });
		if (job.jobType === 'article_generation') await noteGenerationFailure(job, message);
		else await noteRevisionFailure(job, message);
	}
}

export async function getWorkspaceArticle(ownerUserId: string, articleId: string) {
	await releaseStaleJobs(ownerUserId, articleId);
	const article = await requireArticle(ownerUserId, articleId);
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, article.brandId);
	const job = jobs.find((item) => {
		const payload = item.payload as ArticleGenerationJobPayload & { result?: { articleId?: string } };
		return item.jobType === 'article_generation' && (payload.articleId === article.id || payload.result?.articleId === article.id);
	});
	const revisionJob = jobs.find((item) => item.jobType === 'article_revision' && (item.payload as ArticleRevisionJobPayload).articleId === article.id);
	const gate = articleApprovalGate(article);
	const research = article.workspace?.research;
	if (research?.sources.some((source) => !source.classification)) {
		const brain = await requireBrand(ownerUserId, article.brandId).catch(() => null);
		research.sources = withSourceClasses(research.sources, { brandDomain: brandDomain(brain?.identity.website) });
	}
	return {
		article,
		nextStep: articleNextStep(article),
		lifecycle: articleLifecycle(article),
		revisions: listRevisions(article),
		approvalGate: gate,
		model: {
			role: article.workspace?.assignedModelRole ?? 'LONG_FORM_WRITING',
			resolved: resolveModelForRole('LONG_FORM_WRITING'),
		},
		job: job
			? { id: job.id, status: job.status, error: job.lastError ?? null, createdAt: job.createdAt, completedAt: job.completedAt ?? null }
			: null,
		revisionResult: revisionJob ? ((revisionJob.payload as ArticleRevisionJobPayload).result ?? null) : null,
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
	/** Allowed deviation from targetWords, in percent. */
	wordTolerancePct?: number;
	/** Primary category, as a stable id from the destination taxonomy. */
	categoryId?: string;
	tags?: string[];
	researchRequirements?: string;
	internalLinking?: string;
	imageRequirements?: string;
	externalId?: string;
	brief?: Partial<ArticleBriefDetails>;
};

const BRIEF_FIELDS: Array<keyof ArticleBriefDetails> = [
	'secondaryKeywords',
	'questions',
	'avoid',
	'tone',
	'cta',
	'requiredLinks',
	'referenceMaterial',
	'instructions',
	'clusterRole',
	'readerOutcome',
	'distinctiveContribution',
	'productConnection',
	'differentiateFrom',
];

function cleanTolerance(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return DEFAULT_WORD_TOLERANCE_PCT;
	return Math.min(50, Math.max(5, Math.round(value)));
}

/** Checks a chosen category against the destination's synced taxonomy. A missing or renamed category is never replaced. */
async function resolveCategory(
	ownerUserId: string,
	brandId: string,
	destinationId: string | null,
	categoryId: string | undefined,
): Promise<{ categories: string[]; ref: ArticleWorkspace['taxonomyRef'] }> {
	const id = categoryId?.trim();
	if (!id) return { categories: [], ref: null };
	if (!destinationId) throw new ArticleWorkflowError('Choose a website destination before choosing a category.', 400, 'destination_required');
	const taxonomy = await destinationTaxonomy(ownerUserId, brandId, destinationId).catch(() => null);
	if (!taxonomy) throw new ArticleWorkflowError('This destination has no synced taxonomy. Sync it in Websites & CMS, then choose a category.', 422, 'taxonomy_unavailable');
	const category = taxonomy.categories.find((item) => item.id === id);
	if (!category) {
		throw new ArticleWorkflowError(`“${id}” is not a category in ${taxonomy.destination}. Choose one of: ${taxonomy.categories.map((item) => item.name).join(', ')}.`, 400, 'invalid_category');
	}
	return { categories: [category.id], ref: { destinationId, syncedAt: new Date().toISOString(), categoryName: category.name } };
}

function cleanTags(tags: string[] | undefined): string[] {
	return [...new Set((tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function cleanBrief(input: Partial<ArticleBriefDetails> | undefined): Partial<ArticleBriefDetails> {
	const out: Partial<ArticleBriefDetails> = {};
	for (const field of BRIEF_FIELDS) {
		const value = input?.[field];
		if (typeof value === 'string') out[field] = value.slice(0, 4000);
	}
	return out;
}

function sameTitle(a: string, b: string): boolean {
	const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
	return norm(a) === norm(b);
}

export async function createArticleBrief(ownerUserId: string, input: ArticleBriefInput): Promise<{ article: ArticleRecord; existing: boolean }> {
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
	const title = input.workingTitle?.trim() || topic;
	const siblings = await getNativeContentStore().listArticles(ownerUserId, brain.id);
	const duplicate = siblings.find(
		(article) =>
			(externalId && (article.workspace?.externalId === externalId || article.workspace?.cms.externalId === externalId)) ||
			(article.status !== 'published' && (sameTitle(article.title, title) || sameTitle(article.topic, topic))),
	);
	if (duplicate) return { article: duplicate, existing: true };
	const destinationId = input.destinationId?.trim() || null;
	const category = await resolveCategory(ownerUserId, brain.id, destinationId, input.categoryId);
	const targetWords = normaliseTargetWords(input.targetWords);
	const now = new Date().toISOString();
	const id = crypto.randomUUID();
	const slug = slugify(title);
	const brief = { ...emptyWorkspace().brief!, ...cleanBrief(input.brief) };
	const workspace = emptyWorkspace({
		destinationId,
		contentType: input.contentType?.trim() || 'guide',
		wordTarget: { requested: targetWords, approved: null, tolerancePct: cleanTolerance(input.wordTolerancePct) },
		taxonomyRef: category.ref,
		workingTitle: title,
		researchRequirements: input.researchRequirements?.trim() ?? '',
		internalLinking: input.internalLinking?.trim() ?? '',
		imageRequirements: input.imageRequirements?.trim() ?? '',
		externalId,
		brief,
		research: emptyResearchPackage(),
		researchSummary: {
			retrievedAt: null,
			competitors: [],
			recommendedStructure: recommendArticleStructure(topic, splitLines(brief.questions)),
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
		secondaryTopics: splitLines(brief.secondaryKeywords),
		research: { sources: [{ label: 'Brand Brain', kind: 'brand_brain' }], claims: [], gaps: [], usedExternalResearch: false },
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
			secondaryTopics: splitLines(brief.secondaryKeywords),
		},
		author: null,
		categories: category.categories,
		tags: cleanTags(input.tags),
		inlineAssetIds: [],
		mediaPlan: null,
		internalLinkOpportunities: [],
		status: 'brief',
		approval: { required: true, approver: 'human', status: 'pending' },
		publishDestination: workspace.destinationId ?? undefined,
		publication: null,
		performanceContentId: id,
		wordCount: 0,
		targetWords,
		review: null,
		versions: [],
		distribution: { disclosure: null, sponsorship: 'none', contentCluster: null, authorProfileId: null },
		createdAt: now,
		updatedAt: now,
		workspace,
	};
	return { article: await persist(article), existing: false };
}

export type ArticleDraftPatch = Partial<Omit<ArticleBriefInput, 'brandId'>> & {
	body?: string;
	title?: string;
	workingTitle?: string;
	seoTitle?: string;
	metaDescription?: string;
	excerpt?: string;
	slug?: string;
	/** Explicit owner approval to change a published/synced slug. */
	approveSlugChange?: boolean;
};

export async function saveArticleDraft(ownerUserId: string, articleId: string, patch: ArticleDraftPatch): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	let briefChanged = false;
	const change = <T>(current: T, next: T) => {
		if (current !== next) briefChanged = true;
		return next;
	};
	if (patch.topic?.trim()) article.topic = change(article.topic, patch.topic.trim());
	if (patch.workingTitle?.trim()) {
		workspace.workingTitle = change(workspace.workingTitle, patch.workingTitle.trim());
	}
	if (patch.title?.trim()) {
		const title = patch.title.trim();
		article.title = change(article.title, title);
		article.seo.title = title;
		if (!workspace.workingTitle) workspace.workingTitle = title;
	} else if (patch.workingTitle?.trim() && !article.title.trim()) {
		// Seed published title from working title only when no published title exists yet.
		article.title = patch.workingTitle.trim();
		article.seo.title = article.title;
	}
	if ((patch.title?.trim() || patch.workingTitle?.trim()) && !patch.slug?.trim() && !article.publication && !workspace.cms.lastSyncAt && !workspace.seoEdited?.slug) {
		const seed = (patch.title ?? patch.workingTitle)!.trim();
		article.slug = slugify(seed);
		article.seo.slug = article.slug;
	}
	if (patch.primaryKeyword !== undefined) {
		article.primaryKeyword = change(article.primaryKeyword ?? '', patch.primaryKeyword.trim());
		article.seo.primaryKeyword = patch.primaryKeyword.trim() || null;
	}
	if (patch.searchIntent?.trim()) {
		article.searchIntent = change(article.searchIntent, patch.searchIntent.trim().slice(0, 120));
		workspace.researchSummary.searchIntent = article.searchIntent;
	}
	if (patch.audience !== undefined) article.audience = change(article.audience ?? '', patch.audience.trim());
	if (patch.contentType?.trim()) workspace.contentType = change(workspace.contentType, patch.contentType.trim().slice(0, 80));
	if (patch.destinationId !== undefined) {
		const nextDestination = patch.destinationId.trim() || null;
		if (nextDestination !== workspace.destinationId) {
			workspace.destinationId = nextDestination;
			article.publishDestination = nextDestination ?? undefined;
			if (patch.categoryId === undefined) {
				article.categories = [];
				workspace.taxonomyRef = null;
				workspace.categorySuggestion = null;
				briefChanged = true;
			}
		} else {
			workspace.destinationId = nextDestination;
			article.publishDestination = nextDestination ?? undefined;
		}
	}
	if (patch.researchRequirements !== undefined) workspace.researchRequirements = change(workspace.researchRequirements, patch.researchRequirements);
	if (patch.internalLinking !== undefined) workspace.internalLinking = change(workspace.internalLinking, patch.internalLinking);
	if (patch.imageRequirements !== undefined) workspace.imageRequirements = patch.imageRequirements;
	if (patch.targetWords || patch.wordTolerancePct !== undefined) {
		const current = wordTargetFor(article);
		const requested = patch.targetWords ? normaliseTargetWords(patch.targetWords) : current.requested;
		article.targetWords = change(article.targetWords, requested);
		workspace.wordTarget = {
			requested,
			approved: requested === current.requested ? current.approved : null,
			tolerancePct: patch.wordTolerancePct !== undefined ? cleanTolerance(patch.wordTolerancePct) : current.tolerancePct,
		};
	}
	if (patch.categoryId !== undefined) {
		const category = await resolveCategory(ownerUserId, article.brandId, workspace.destinationId, patch.categoryId);
		if (category.categories[0] !== article.categories[0]) {
			article.categories = category.categories;
			workspace.taxonomyRef = category.ref;
			workspace.categorySuggestion = null;
		}
	}
	if (patch.tags !== undefined) article.tags = cleanTags(patch.tags);
	if (patch.brief) {
		const next = { ...workspace.brief!, ...cleanBrief(patch.brief) };
		for (const field of BRIEF_FIELDS) if (next[field] !== workspace.brief![field]) briefChanged = true;
		workspace.brief = next;
		article.secondaryTopics = splitLines(next.secondaryKeywords);
		article.seo.secondaryTopics = article.secondaryTopics;
		if (!article.body.trim()) {
			workspace.researchSummary.recommendedStructure = recommendArticleStructure(article.topic, splitLines(next.questions));
			article.outline = workspace.researchSummary.recommendedStructure;
		}
	}
	if (patch.externalId !== undefined && patch.externalId.trim()) {
		let externalId: string;
		try {
			externalId = normaliseExternalId(patch.externalId);
		} catch (error) {
			throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Invalid external ID.', 400, 'invalid_external_id');
		}
		const current = workspace.externalId || workspace.cms.externalId;
		if (current && current !== externalId) {
			throw new ArticleWorkflowError('The external ID is already linked. It cannot change, so the CMS keeps updating the same draft.', 409, 'external_id_locked');
		}
		const clash = (await getNativeContentStore().listArticles(ownerUserId, article.brandId)).find(
			(other) => other.id !== article.id && (other.workspace?.externalId === externalId || other.workspace?.cms.externalId === externalId),
		);
		if (clash) throw new ArticleWorkflowError(`Another article (“${clash.title}”) already uses that external ID.`, 409, 'external_id_in_use');
		workspace.externalId = externalId;
		workspace.cms.externalId = externalId;
	}
	const seoEdited = { ...(workspace.seoEdited ?? {}) };
	if (patch.seoTitle !== undefined) {
		article.seo.seoTitle = sanitizePlainMetadata(patch.seoTitle, 70);
		seoEdited.seoTitle = true;
	}
	if (patch.metaDescription !== undefined) {
		article.seo.metaDescription = sanitizePlainMetadata(patch.metaDescription, 160);
		seoEdited.metaDescription = true;
	}
	if (patch.excerpt !== undefined) {
		article.excerpt = sanitizePlainMetadata(patch.excerpt, 320);
		article.seo.excerpt = article.excerpt;
		seoEdited.excerpt = true;
	}
	if (patch.slug !== undefined && patch.slug.trim()) {
		const locked = Boolean(article.publication || workspace.cms.lastSyncAt);
		if (locked && !patch.approveSlugChange) {
			throw new ArticleWorkflowError('The published slug is locked. Approve a URL change explicitly before editing it.', 409, 'slug_locked');
		}
		article.slug = slugifyTitle(patch.slug);
		article.seo.slug = article.slug;
		seoEdited.slug = true;
	}
	if (Object.keys(seoEdited).length) workspace.seoEdited = seoEdited;
	if (briefChanged && workspace.briefApprovedAt) {
		workspace.briefApprovedAt = null;
		workspace.briefChangedAfterApproval = true;
	}
	if (typeof patch.body === 'string' && patch.body.trim() !== article.body.trim()) {
		article.workspace = workspace;
		commitRevision(article, patch.body, 'manual', 'Manual edit');
		article.approval = { required: true, approver: 'human', status: 'pending' };
		workspace.approvedAt = null;
		workspace.approvedRevisionId = null;
		if (article.status === 'approved') article.status = 'draft';
	}
	article.workspace = workspace;
	return persist(article);
}

/** Converts the research record that existed before research packages into the first package version. */
async function migrateLegacyResearch(ownerUserId: string, article: ArticleRecord, pkg: ResearchPackage, brain: Awaited<ReturnType<typeof requireBrand>>) {
	const researchId = article.workspace?.researchId;
	if (pkg.version > 0 || !researchId) return;
	const records = await getAgentStore().listResearch(ownerUserId, article.brandId);
	const record = records.find((item) => item.id === researchId);
	if (!record) return;
	mergeResearchRecord(pkg, record, {
		terms: briefTerms(article),
		brandDomain: brandDomain(brain.identity.website),
		kind: 'migrated',
		question: null,
	});
}

function brandDomain(website: string | undefined): string | null {
	if (!website) return null;
	try {
		return new URL(website).hostname.replace(/^www\./, '').toLowerCase();
	} catch {
		return null;
	}
}

async function assessRelevance(ownerUserId: string, article: ArticleRecord, pkg: ResearchPackage, fromVersion: number) {
	if (process.env.VITEST === 'true') return;
	const candidates = pkg.items.filter((item) => item.addedInVersion >= fromVersion && !item.excluded && item.kind !== 'user' && item.kind !== 'brand').slice(0, 40);
	if (!candidates.length) return;
	const sourceById = new Map(pkg.sources.map((source) => [source.id, source]));
	try {
		const completion = await getIntelligenceAi().completeJson<{ items?: RelevanceVerdict[]; recommendations?: string[] }>(
			'REVIEW',
			[
				{
					role: 'system',
					content:
						'You check research for one article brief. For each item return id, keep (false if it is not about the brief topic, is about an unrelated person or company, or is navigation text), kind (topic for evidence about the subject, competitor for analysis of competing content), reason, and unsupported (true if it states a fact or statistic its source title does not suggest it supports). Also return up to 5 recommendations: short editorial suggestions for what the article should cover, based on the kept items. Return JSON with items and recommendations.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						brief: {
							topic: article.topic,
							title: article.title,
							searchIntent: article.searchIntent,
							primaryKeyword: article.primaryKeyword,
							questions: splitLines(article.workspace?.brief?.questions),
						},
						items: candidates.map((item) => ({
							id: item.id,
							text: item.text.slice(0, 500),
							sources: item.sourceIds.map((id) => sourceById.get(id)).filter(Boolean).map((source) => `${source!.title} (${source!.domain})`),
						})),
					}),
				},
			],
			'article_research_relevance',
			ownerUserId,
		);
		applyRelevanceVerdicts(pkg, Array.isArray(completion.data.items) ? completion.data.items : [], Array.isArray(completion.data.recommendations) ? completion.data.recommendations.map(String) : []);
	} catch (error) {
		pkg.gaps = [...new Set([...pkg.gaps, `Relevance check did not run: ${error instanceof Error ? error.message : 'unknown error'}. Review the findings manually.`])];
	}
}

export type ResearchMode = 'initial' | 'follow_up' | 'deeper';

export async function researchArticle(ownerUserId: string, articleId: string, input?: { mode?: ResearchMode; question?: string }): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const workspace = ensureWorkspace(article);
	const mode = input?.mode ?? 'initial';
	const question = input?.question?.trim() ?? '';
	if (mode === 'follow_up' && !question) throw new ArticleWorkflowError('Ask a follow-up question.', 400, 'question_required');
	const pkg = ensureResearchPackage(article);
	await migrateLegacyResearch(ownerUserId, article, pkg, brain);
	const brief = workspace.brief;
	const plannedQuestions = [
		...splitLines(brief?.questions),
		question,
		article.primaryKeyword ? `What does a beginner need to know about ${article.primaryKeyword}?` : '',
		article.audience ? `What obstacles does ${article.audience} face when starting?` : '',
		brief?.readerOutcome ? `How does the reader reach: ${brief.readerOutcome}` : '',
		brief?.differentiateFrom ? `What should this article cover that is not already covered by: ${splitLines(brief.differentiateFrom).join('; ')}?` : '',
	].filter(Boolean).slice(0, 8);
	if (mode === 'initial' || !(pkg.questions?.length)) pkg.questions = plannedQuestions;
	else if (mode === 'follow_up' && question) pkg.questions = [...new Set([...(pkg.questions ?? []), question])].slice(0, 12);
	const provider = selectSearchProvider();
	const query =
		mode === 'follow_up'
			? `${question} ${article.primaryKeyword || article.topic}`
			: mode === 'deeper'
				? [question || article.topic, ...(pkg.questions ?? []).slice(0, 2)].join(' ')
				: [article.topic, article.primaryKeyword, ...(pkg.questions ?? []).slice(0, 3), workspace.researchRequirements].filter(Boolean).join('. ');
	const record: ResearchRecord = await executeResearch({
		ownerUserId,
		brandId: brain.id,
		brandName: brain.identity.name,
		query: query.slice(0, 380),
		projectType: 'ARTICLE_RESEARCH',
		brandFacts: brain.knowledge.brandFacts,
		search: provider.configured ? provider : { name: provider.name, configured: false, async search() { return []; } },
		researchDecision: mode === 'deeper' ? 'FULL_RESEARCH' : 'QUICK_VERIFY',
		readPages: mode === 'deeper' ? 5 : 0,
	});
	const before = pkg.version + 1;
	mergeResearchRecord(pkg, record, {
		terms: briefTerms(article),
		brandDomain: brandDomain(brain.identity.website),
		kind: pkg.version === 0 ? 'initial' : mode === 'initial' ? 'follow_up' : mode,
		question: question || null,
	});
	pkg.sources = withSourceClasses(pkg.sources, { brandDomain: brandDomain(brain.identity.website) });
	addBrandContext(pkg, brain.knowledge.brandFacts ?? []);
	await assessRelevance(ownerUserId, article, pkg, before);
	const taxonomy = await taxonomyFor(article);
	const siblings = await getNativeContentStore().listArticles(ownerUserId, article.brandId);
	workspace.research = pkg;
	workspace.researchId = record.id;
	workspace.researchSummary = {
		retrievedAt: record.createdAt,
		competitors: pkg.items
			.filter((item) => item.kind === 'competitor' && !item.excluded)
			.map((item) => ({ name: item.text.split(':')[0].slice(0, 80), website: pkg.sources.find((source) => item.sourceIds.includes(source.id))?.url, claims: [item.text] })),
		recommendedStructure: article.body.trim() ? workspace.researchSummary.recommendedStructure : recommendArticleStructure(article.topic, splitLines(brief?.questions)),
		relatedArticleSlugs: relatedArticleSlugs(siblings, article.id, article.topic),
		relatedTools: matchingTools(taxonomy, `${article.topic} ${article.primaryKeyword ?? ''}`),
		searchIntent: article.searchIntent,
	};
	article.internalLinkOpportunities = [
		...workspace.researchSummary.relatedArticleSlugs,
		...workspace.researchSummary.relatedTools.map((tool) => tool.slug),
	];
	article.workspace = workspace;
	return persist(article);
}

export type ResearchEdit =
	| { op: 'notes'; notes?: string; expertise?: string }
	| { op: 'exclude' | 'restore'; id: string; reason?: string }
	| { op: 'edit'; id: string; text: string }
	| { op: 'add_source'; url: string; title?: string; note?: string }
	| { op: 'add_evidence'; text: string };

export async function editArticleResearch(ownerUserId: string, articleId: string, edit: ResearchEdit): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const pkg = ensureResearchPackage(article);
	if (pkg.version === 0) {
		const brain = await requireBrand(ownerUserId, article.brandId);
		await migrateLegacyResearch(ownerUserId, article, pkg, brain);
	}
	try {
		if (edit.op === 'notes') updateNotes(pkg, { notes: edit.notes?.slice(0, 8000), expertise: edit.expertise?.slice(0, 8000) });
		else if (edit.op === 'exclude' || edit.op === 'restore') setItemExcluded(pkg, edit.id, edit.op === 'exclude', edit.reason);
		else if (edit.op === 'edit') editItemText(pkg, edit.id, edit.text.slice(0, 2000));
		else if (edit.op === 'add_source') {
			let url: URL;
			try {
				url = assertPublicHttpUrl(edit.url.trim());
			} catch {
				throw new Error('Enter a public https URL for the source.');
			}
			addUserSource(pkg, { url: url.toString(), title: edit.title?.slice(0, 200), note: edit.note?.slice(0, 2000) });
		} else if (edit.op === 'add_evidence') addUserEvidence(pkg, edit.text.slice(0, 4000));
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Research edit failed.', 400, 'research_edit_failed');
	}
	workspace.research = pkg;
	article.workspace = workspace;
	return persist(article);
}

export async function approveArticleResearch(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const pkg = ensureResearchPackage(article);
	const brain = await requireBrand(ownerUserId, article.brandId);
	if (pkg.version === 0) await migrateLegacyResearch(ownerUserId, article, pkg, brain);
	pkg.sources = withSourceClasses(pkg.sources, { brandDomain: brandDomain(brain.identity.website) });
	try {
		approveResearch(pkg);
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Research cannot be approved.', 400, 'research_incomplete');
	}
	workspace.research = pkg;
	article.workspace = workspace;
	return persist(article);
}

export async function enhanceArticleBrief(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const workspace = ensureWorkspace(article);
	const brief = workspace.brief!;
	const pkg = workspace.research;
	const research = (pkg?.items ?? []).filter((item) => !item.excluded).slice(0, 25).map((item) => ({ kind: item.kind, text: item.text.slice(0, 300) }));
	let suggestions: BriefSuggestion[] = [];
	if (process.env.VITEST === 'true') {
		if (!brief.questions.trim()) suggestions.push({ field: 'questions', value: `What does ${article.topic} involve?\nWhat are the steps, in order?`, reason: 'The brief has no reader questions.' });
		if (!brief.tone.trim() && brain.voice.tone) suggestions.push({ field: 'tone', value: brain.voice.tone, reason: 'Taken from the Brand Brain voice.' });
	} else {
		const completion = await getIntelligenceAi().completeJson<{ suggestions?: BriefSuggestion[] }>(
			'STRATEGY',
			[
				{
					role: 'system',
					content:
						'Suggest improvements to an article brief. Return JSON with suggestions: array of field, value, reason. field is one of workingTitle, primaryKeyword, audience, secondaryKeywords, questions, avoid, tone, cta, requiredLinks, instructions, clusterRole, readerOutcome, distinctiveContribution, productConnection, differentiateFrom, targetWords. Suggest only where the brief is empty or clearly weaker than the research and Brand Brain allow. For list fields, put one item per line. Never restate what the brief already says. targetWords belongs to the author: suggest a different number only with a concrete reason, as a plain integer.',
				},
				{
					role: 'user',
					content: JSON.stringify({
						brief: {
							workingTitle: article.title,
							topic: article.topic,
							primaryKeyword: article.primaryKeyword,
							searchIntent: article.searchIntent,
							audience: article.audience,
							contentType: workspace.contentType,
							targetWords: article.targetWords,
							categoryId: article.categories[0] ?? null,
							...brief,
						},
						brand: { name: brain.identity.name, voice: brain.voice, audiences: brain.identity.audiences, guardrails: brain.guardrails },
						research,
					}),
				},
			],
			'article_brief_enhancement',
			ownerUserId,
		);
		const allowed = new Set(['workingTitle', 'primaryKeyword', 'audience', 'targetWords', ...BRIEF_FIELDS]);
		suggestions = (completion.data.suggestions ?? [])
			.map((item) => (item && item.field === 'targetWords' ? { ...item, value: String(item.value ?? '') } : item))
			.filter((item) => item && allowed.has(String(item.field)) && typeof item.value === 'string' && item.value.trim())
			.filter((item) => item.field !== 'targetWords' || Number(item.value) !== article.targetWords)
			.map((item) => ({ field: item.field, value: item.value.trim().slice(0, 2000), reason: String(item.reason ?? '').slice(0, 300) }))
			.slice(0, 10);
	}
	workspace.briefSuggestions = { createdAt: new Date().toISOString(), suggestions };
	article.workspace = workspace;
	return persist(article);
}

export async function resolveBriefSuggestion(ownerUserId: string, articleId: string, index: number, apply: boolean): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const suggestion = workspace.briefSuggestions?.suggestions[index];
	if (!suggestion) throw new ArticleWorkflowError('Suggestion not found.', 404, 'suggestion_not_found');
	workspace.briefSuggestions!.suggestions = workspace.briefSuggestions!.suggestions.filter((_, position) => position !== index);
	article.workspace = workspace;
	if (!apply) return persist(article);
	await persist(article);
	const field = suggestion.field;
	if (field === 'workingTitle') return saveArticleDraft(ownerUserId, articleId, { workingTitle: suggestion.value });
	if (field === 'primaryKeyword') return saveArticleDraft(ownerUserId, articleId, { primaryKeyword: suggestion.value });
	if (field === 'audience') return saveArticleDraft(ownerUserId, articleId, { audience: suggestion.value });
	if (field === 'targetWords') {
		const words = Number.parseInt(suggestion.value, 10);
		if (!Number.isFinite(words)) throw new ArticleWorkflowError('The suggested length is not a number.', 400, 'invalid_suggestion');
		return saveArticleDraft(ownerUserId, articleId, { targetWords: words });
	}
	const current = workspace.brief![field] ?? '';
	const value = current.trim() ? `${current.trim()}\n${suggestion.value}` : suggestion.value;
	return saveArticleDraft(ownerUserId, articleId, { brief: { [field]: value } });
}

export async function approveArticleBrief(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.title.trim() || !article.topic.trim()) {
		throw new ArticleWorkflowError('Add a topic and working title before approving the brief.', 400, 'brief_incomplete');
	}
	if (!article.searchIntent.trim()) throw new ArticleWorkflowError('Choose a search intent before approving the brief.', 400, 'brief_incomplete');
	const workspace = ensureWorkspace(article);
	workspace.briefApprovedAt = new Date().toISOString();
	workspace.briefChangedAfterApproval = false;
	const words = wordTargetFor(article);
	workspace.wordTarget = { ...words, approved: words.requested };
	if (!article.body.trim()) {
		workspace.researchSummary.recommendedStructure = recommendArticleStructure(article.topic, splitLines(workspace.brief?.questions));
		article.outline = workspace.researchSummary.recommendedStructure;
	}
	article.workspace = workspace;
	return persist(article);
}

async function activeJob(ownerUserId: string, article: ArticleRecord, type: 'article_generation' | 'article_revision') {
	const jobs = await getIntelligenceStore().listJobs(ownerUserId, article.brandId);
	return jobs.find(
		(job) =>
			job.jobType === type &&
			(job.payload as { articleId?: string }).articleId === article.id &&
			(job.status === 'queued' || job.status === 'processing' || job.status === 'retrying') &&
			!articleGenerationJobIsStale(job),
	);
}

export async function startArticleGeneration(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; jobId: string }> {
	await releaseStaleJobs(ownerUserId, articleId);
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.briefApprovedAt) {
		throw new ArticleWorkflowError('Approve the brief before generating a draft.', 400, 'brief_not_approved');
	}
	if (!workspace.research?.approved) {
		throw new ArticleWorkflowError('Approve the research before generating. Generation uses only the approved research version.', 400, 'research_not_approved');
	}
	assertNotApproved(article, 'Regeneration');
	if (await activeJob(ownerUserId, article, 'article_generation')) {
		throw new ArticleWorkflowError('A generation job is already running for this article.', 409, 'generation_in_progress');
	}
	if (await activeJob(ownerUserId, article, 'article_revision')) {
		throw new ArticleWorkflowError('A revision job is running for this article. Wait for it to finish.', 409, 'revision_in_progress');
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
	const now = new Date().toISOString();
	workspace.generation = {
		...workspace.generation,
		jobId: job.id,
		status: 'queued',
		stage: 'Queued',
		startedAt: now,
		updatedAt: now,
		error: null,
		researchVersion: workspace.research.approved.version,
	};
	workspace.assignedModel = resolveModelForRole('LONG_FORM_WRITING');
	article.workspace = workspace;
	await persist(article);
	try {
		await launchJob(job.id, 'generation');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Article generation failed';
		await noteGenerationFailure(job, message);
		throw new ArticleWorkflowError(message, 502, 'generation_failed');
	}
	return { article: await requireArticle(ownerUserId, articleId), jobId: job.id };
}

export async function retryArticleGeneration(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; jobId: string }> {
	return startArticleGeneration(ownerUserId, articleId);
}

export async function reviewArticle(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.body.trim()) throw new ArticleWorkflowError('Generate a draft before review.', 400, 'draft_missing');
	const brain = await requireBrand(ownerUserId, article.brandId);
	const taxonomy = await taxonomyFor(article);
	try {
		await reviewCurrentRevision({ article, brain, taxonomy, ai: getIntelligenceAi(), ownerUserId });
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Review failed.', 502, 'review_failed');
	}
	return persist(article);
}

export async function decideRecommendation(
	ownerUserId: string,
	articleId: string,
	findingId: string,
	decision: 'accepted' | 'rejected' | 'pending' | 'dismissed',
): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const finding = workspace.editorial.findings.find((item) => item.id === findingId);
	if (!finding) throw new ArticleWorkflowError('Recommendation not found.', 404, 'finding_not_found');
	if (finding.decision === 'applied' || finding.decision === 'superseded' || finding.decision === 'resolved_auto') {
		throw new ArticleWorkflowError(`This recommendation is already ${finding.decision}.`, 409, 'finding_closed');
	}
	if ((decision === 'rejected' || decision === 'dismissed') && finding.rejectable === false) {
		throw new ArticleWorkflowError('Structural defects cannot be dismissed. Fix them in the draft or apply the recommendation.', 400, 'finding_not_rejectable');
	}
	finding.decision = decision;
	finding.decidedAt = new Date().toISOString();
	if (decision === 'dismissed') finding.note = finding.note || 'Dismissed by the editor.';
	workspace.editorial.status = openCriticalFindings(workspace).length
		? workspace.editorial.exhausted
			? 'blocked'
			: 'findings'
		: workspace.editorial.findings.some((item) => item.decision === 'pending' || item.decision === 'accepted')
			? 'findings'
			: 'ready';
	article.workspace = workspace;
	return persist(article);
}

export async function suggestWorkspaceTitles(ownerUserId: string, articleId: string): Promise<{ suggestions: TitleSuggestion[]; current: { workingTitle: string; publishedTitle: string; seoTitle: string; slug: string } }> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const siblings = await getNativeContentStore().listArticles(ownerUserId, article.brandId);
	return {
		suggestions: suggestArticleTitles({
			currentTitle: article.title,
			topic: article.topic,
			primaryKeyword: article.primaryKeyword,
			audience: article.audience,
			searchIntent: article.searchIntent,
			readerOutcome: workspace.brief?.readerOutcome,
			existingTitles: siblings.map((sibling) => sibling.title),
		}),
		current: {
			workingTitle: workspace.workingTitle || article.title,
			publishedTitle: article.title,
			seoTitle: article.seo.seoTitle || '',
			slug: article.slug,
		},
	};
}

/** Rewrites a finding's instruction in the editor's words and accepts it. The original instruction is kept. */
export async function editRecommendation(ownerUserId: string, articleId: string, findingId: string, instruction: string): Promise<ArticleRecord> {
	const text = instruction.trim().slice(0, 2000);
	if (!text) throw new ArticleWorkflowError('Write the instruction to apply.', 400, 'instruction_required');
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const finding = workspace.editorial.findings.find((item) => item.id === findingId);
	if (!finding) throw new ArticleWorkflowError('Recommendation not found.', 404, 'finding_not_found');
	if (finding.decision === 'applied' || finding.decision === 'superseded') {
		throw new ArticleWorkflowError(`This recommendation is already ${finding.decision}.`, 409, 'finding_closed');
	}
	finding.editedInstruction = text;
	finding.decision = 'accepted';
	finding.decidedAt = new Date().toISOString();
	workspace.editorial.status = openCriticalFindings(workspace).length ? (workspace.editorial.exhausted ? 'blocked' : 'findings') : 'findings';
	article.workspace = workspace;
	return persist(article);
}

/**
 * Applies a finding's deterministic fix to the current revision, saves a new revision and reruns review on it.
 * Only the text the fix targets changes; no model rewrites the article.
 */
export async function applyFindingFix(ownerUserId: string, articleId: string, findingId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	assertNotApproved(article, 'Applying a fix');
	const workspace = ensureWorkspace(article);
	const revision = ensureRevision(article);
	const finding = workspace.editorial.findings.find((item) => item.id === findingId);
	if (!finding) throw new ArticleWorkflowError('Recommendation not found.', 404, 'finding_not_found');
	if (!finding.fix) throw new ArticleWorkflowError('This recommendation has no automatic fix. Accept it and apply revisions instead.', 400, 'no_fix');
	if (!revision || workspace.editorial.reviewedRevisionId !== revision.id) {
		throw new ArticleWorkflowError('The draft changed after review. Rerun review first.', 409, 'review_stale');
	}
	const result = unlinkRepeats(article.body, finding.fix.url, finding.fix.keepFirst);
	if (!result.removed) throw new ArticleWorkflowError('Nothing to change: the repeated links are already gone.', 409, 'fix_not_applicable');
	article.workspace = workspace;
	const next = commitRevision(article, result.body, 'revision', `Removed ${result.removed} repeat link${result.removed === 1 ? '' : 's'} to ${finding.fix.url}.`);
	finding.decision = 'applied';
	finding.decidedAt = new Date().toISOString();
	finding.appliedInRevisionId = next.id;
	finding.note = `Applied automatically: ${result.removed} link${result.removed === 1 ? '' : 's'} removed, anchor text kept.`;
	article.approval = { required: true, approver: 'human', status: 'pending' };
	const brain = await requireBrand(ownerUserId, article.brandId);
	const taxonomy = await taxonomyFor(article);
	try {
		await reviewCurrentRevision({ article, brain, taxonomy, ai: getIntelligenceAi(), ownerUserId });
	} catch (error) {
		ensureWorkspace(article).editorial.status = 'not_run';
		article.review = { materialPassed: false, note: `The fix was saved, but review did not rerun: ${error instanceof Error ? error.message : 'unknown error'}.`, coherenceFindings: [] };
	}
	return persist(article);
}

export async function applyAcceptedRevisions(ownerUserId: string, articleId: string): Promise<{ article: ArticleRecord; jobId: string }> {
	await releaseStaleJobs(ownerUserId, articleId);
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	assertNotApproved(article, 'Applying revisions');
	const revision = ensureRevision(article);
	if (!revision) throw new ArticleWorkflowError('There is no draft to revise.', 400, 'draft_missing');
	if (workspace.editorial.reviewedRevisionId !== revision.id) {
		throw new ArticleWorkflowError(`The recommendations belong to an older revision. Rerun review on revision ${revision.number} first.`, 409, 'review_stale');
	}
	if (workspace.editorial.cyclesUsed >= workspace.editorial.maxCycles) {
		throw new ArticleWorkflowError(
			`All ${workspace.editorial.maxCycles} revision cycles are used. Edit the draft yourself and rerun review. Using up the limit is not approval.`,
			409,
			'review_cycles_exhausted',
		);
	}
	const accepted = workspace.editorial.findings.filter((finding) => finding.decision === 'accepted');
	if (!accepted.length) throw new ArticleWorkflowError('Accept at least one recommendation first.', 400, 'no_accepted_recommendations');
	if (await activeJob(ownerUserId, article, 'article_revision')) {
		throw new ArticleWorkflowError('A revision is already running.', 409, 'revision_in_progress');
	}
	if (await activeJob(ownerUserId, article, 'article_generation')) {
		throw new ArticleWorkflowError('Generation is running. Wait for it to finish.', 409, 'generation_in_progress');
	}
	const job = await enqueueArticleRevisionJob({
		ownerUserId,
		brandBrainId: article.brandId,
		payload: { brandId: article.brandId, articleId: article.id, baseRevisionId: revision.id, findingIds: accepted.map((finding) => finding.id) },
	});
	const now = new Date().toISOString();
	workspace.revisionJob = {
		jobId: job.id,
		status: 'queued',
		stage: 'Queued',
		startedAt: now,
		updatedAt: now,
		error: null,
		baseRevisionId: revision.id,
		resultRevisionId: null,
	};
	article.workspace = workspace;
	await persist(article);
	try {
		await launchJob(job.id, 'revision');
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Revision failed';
		await noteRevisionFailure(job, message);
		throw new ArticleWorkflowError(message, 502, 'revision_failed');
	}
	return { article: await requireArticle(ownerUserId, articleId), jobId: job.id };
}

export async function classifyWorkspaceArticle(ownerUserId: string, articleId: string, categoryId?: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) throw new ArticleWorkflowError('Choose a website destination before classifying.', 400, 'destination_required');
	const taxonomy = await taxonomyFor(article);
	if (!taxonomy) throw new ArticleWorkflowError('This destination has no synced taxonomy. Sync it in Websites & CMS.', 422, 'taxonomy_unavailable');
	if (categoryId) {
		try {
			article.categories = [assertDestinationCategory(taxonomy, categoryId)];
		} catch {
			throw new ArticleWorkflowError(`“${categoryId}” is not a category in this destination.`, 400, 'invalid_category');
		}
		if (workspace.categorySuggestion?.categoryId === categoryId && !article.tags.length) article.tags = workspace.categorySuggestion.tags;
		workspace.categorySuggestion = null;
		article.workspace = workspace;
		return persist(article);
	}
	const destination = await destinationForBrand(ownerUserId, article.brandId, workspace.destinationId).catch(asWorkflowError);
	const now = new Date().toISOString();
	const mapped = categoryFromMappings(destination.settings, `${article.topic} ${article.title} ${article.primaryKeyword ?? ''}`);
	if (mapped && taxonomy.categories.some((category) => category.id === mapped.categoryId)) {
		workspace.categorySuggestion = { categoryId: mapped.categoryId, reason: `The topic matches the mapping “${mapped.topic}”.`, source: 'mapping', tags: [], createdAt: now };
	} else {
		try {
			const classification = await classifyArticleForDestination({
				ai: getIntelligenceAi(),
				ownerUserId,
				topic: `${article.topic} ${article.title}`,
				searchIntent: article.searchIntent,
				audience: article.audience,
				objective: article.objective,
				taxonomy,
			});
			const name = taxonomy.categories.find((category) => category.id === classification.categoryId)?.name ?? classification.categoryId;
			workspace.categorySuggestion = {
				categoryId: classification.categoryId,
				reason: `Suggested from the topic and search intent. ${name} is the closest category the CMS returned.`,
				source: 'ai',
				tags: classification.tags,
				createdAt: now,
			};
			workspace.researchSummary.relatedTools = taxonomy.tools
				.filter((tool) => classification.toolSlugs.includes(tool.slug))
				.map((tool) => ({ slug: tool.slug, label: tool.label }));
		} catch {
			const fallback = destination.settings.defaultCategoryId;
			if (!fallback) throw new ArticleWorkflowError('No category could be suggested. Choose one from the list.', 502, 'classification_failed');
			workspace.categorySuggestion = { categoryId: fallback, reason: 'The destination default category.', source: 'default', tags: [], createdAt: now };
		}
	}
	article.workspace = workspace;
	return persist(article);
}

async function verifyMediaUrl(url: string | undefined): Promise<{ ok: boolean; error: string | null }> {
	if (!url) return { ok: false, error: 'The image has no delivery URL.' };
	const fetched = await fetchAllowedImage(url);
	return fetched.ok ? { ok: true, error: null } : { ok: false, error: fetched.error };
}

async function verifyHeroDestinationDelivery(
	ownerUserId: string,
	article: ArticleRecord,
	workspace: NonNullable<ArticleRecord['workspace']>,
	url: string,
): Promise<{ ok: boolean; error: string | null }> {
	const fetched = await fetchAllowedImage(url);
	if (!fetched.ok) return { ok: false, error: fetched.error };
	if (!workspace.destinationId) return { ok: true, error: null };
	const { adapter, connection, destination } = await resolveConnection(ownerUserId, article.brandId, workspace.destinationId).catch(asWorkflowError);
	if (connection.destination.settings.media.delivery !== 'upload') return { ok: true, error: null };
	const credit = workspace.media.credit || 'Crisp Content Engine';
	const license = workspace.media.license || `Generated for ${destination.name} editorial use`;
	const uploaded = await adapter.uploadMedia(connection, {
		bytes: fetched.bytes,
		mimeType: fetched.mimeType,
		alt: workspace.media.heroAlt || article.title,
		credit,
		license,
		filename: mediaFilename(article.slug, 'hero', 'image/jpeg'),
	});
	if (!uploaded.ok) return { ok: false, error: uploaded.error };
	workspace.cms.heroMediaId = uploaded.mediaId;
	workspace.cms.heroSourceUrl = url;
	return { ok: true, error: null };
}

function ensureMediaCreative(workspace: ArticleWorkspace): MediaCreativeState {
	const current = workspace.media.creative ?? emptyMediaCreativeState();
	workspace.media.creative = {
		hero: mergeImageBrief(current.hero, null, 'hero'),
		og: mergeImageBrief(current.og, null, 'og'),
	};
	return workspace.media.creative;
}

export async function prepareArticleImageBrief(
	ownerUserId: string,
	articleId: string,
	role: ArticleImageRole,
): Promise<{ article: ArticleRecord; brief: ImageCreativeBrief }> {
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const workspace = ensureWorkspace(article);
	const creative = ensureMediaCreative(workspace);
	const suggested = suggestImageConcept({
		role,
		title: article.title,
		topic: article.topic,
		excerpt: article.excerpt || article.body.slice(0, 400),
		audience: article.audience,
		imageRequirements: workspace.imageRequirements,
	});
	const brandStyleNotes = creative[role].brandStyleNotes || '';
	const concept = creative[role].concept.trim() || suggested;
	const built = buildArticleImagePrompt({
		role,
		brand: brain,
		topic: article.topic,
		concept,
		excerpt: article.excerpt || article.body.slice(0, 400),
		negativeConstraints: creative[role].negativeConstraints,
		brandStyleNotes,
	});
	const recent = (await getNativeContentStore().listAssets(ownerUserId, article.brandId))
		.filter((asset) => asset.sourceType === 'generated')
		.slice(0, 12)
		.map((asset) => String(asset.provenance.concept ?? asset.title ?? ''))
		.filter(Boolean);
	creative[role] = {
		...creative[role],
		suggestedConcept: suggested,
		concept,
		prompt: creative[role].prompt.trim() || built.prompt,
		brandStyleNotes: brandStyleNotes || creative[role].brandStyleNotes,
		dimensions: built.dimensions,
		similarityWarning: conceptSimilarityWarning(concept, recent),
		estimatedCostUsd: creative[role].estimatedCostUsd,
	};
	article.workspace = workspace;
	await persist(article);
	return { article, brief: creative[role] };
}

export async function saveArticleImageBrief(
	ownerUserId: string,
	articleId: string,
	role: ArticleImageRole,
	patch: Partial<ImageCreativeBrief>,
): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	const creative = ensureMediaCreative(workspace);
	creative[role] = mergeImageBrief(creative[role], { ...patch, purpose: role }, role);
	article.workspace = workspace;
	return persist(article);
}

export type GenerateArticleMediaOptions = {
	prompt?: string;
	concept?: string;
	negativeConstraints?: string;
	revisionInstructions?: string;
	referenceAssetIds?: string[];
	brandStyleNotes?: string;
	/** Force a new asset even when the concept matches a prior generation. */
	forceNew?: boolean;
	/** Select a prior candidate without generating. */
	selectAssetId?: string;
};

export async function generateArticleMedia(
	ownerUserId: string,
	articleId: string,
	role: ArticleImageRole,
	options: GenerateArticleMediaOptions = {},
): Promise<ArticleRecord> {
	if (options.selectAssetId) {
		return replaceArticleMedia(ownerUserId, articleId, options.selectAssetId, role);
	}
	const article = await requireArticle(ownerUserId, articleId);
	const brain = await requireBrand(ownerUserId, article.brandId);
	const workspace = ensureWorkspace(article);
	const creative = ensureMediaCreative(workspace);
	const brief = creative[role];
	const suggested = suggestImageConcept({
		role,
		title: article.title,
		topic: article.topic,
		excerpt: article.excerpt || article.body.slice(0, 400),
		audience: article.audience,
		imageRequirements: workspace.imageRequirements,
	});
	const concept = (options.concept ?? brief.concept ?? suggested).trim() || suggested;
	const negativeConstraints = options.negativeConstraints ?? brief.negativeConstraints;
	const revisionInstructions = options.revisionInstructions ?? brief.revisionInstructions;
	const brandStyleNotes = options.brandStyleNotes ?? brief.brandStyleNotes;
	const referenceAssetIds = options.referenceAssetIds ?? brief.referenceAssetIds;
	const built = buildArticleImagePrompt({
		role,
		brand: brain,
		topic: article.topic,
		concept,
		excerpt: article.excerpt || article.body.slice(0, 400),
		negativeConstraints,
		revisionInstructions,
		brandStyleNotes,
	});
	const prompt = (options.prompt ?? brief.prompt ?? built.prompt).trim() || built.prompt;
	const forceNew =
		options.forceNew === true ||
		Boolean(revisionInstructions?.trim()) ||
		Boolean(options.prompt?.trim()) ||
		Boolean(options.concept?.trim()) ||
		Boolean(workspace.media[role === 'hero' ? 'heroUrl' : 'ogUrl']);

	const planned = planMedia({ channel: 'BLOG', topic: article.topic, objective: article.objective, contentType: 'article' });
	const decision: MediaDecision = {
		...planned,
		mediaRecommended: true,
		mediaType: role === 'og' ? 'IMAGE' : 'HERO_IMAGE',
		mediaRole: 'SUPPORTING',
		visualConcept: concept,
		aspectRatio: aspectRatioForRole(role),
		preferredSource: referenceAssetIds.length ? 'generate' : planned.preferredSource,
		referenceAssetIds,
		generateNow: forceNew,
		altTextDirection: role === 'og' ? 'Describe the social share image accurately for a small preview.' : 'Describe the hero image accurately for accessibility.',
		textOverlayRecommendation: planned.textOverlayRecommendation,
	};

	let generated;
	try {
		generated = await generateAssetFromProposal({
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
			promptOverride: prompt,
			negativeConstraints,
			revisionInstructions,
			brandStyleNotes,
			roleFraming:
				role === 'og'
					? 'Compose for social sharing: subject must remain clear when cropped to a small card.'
					: 'Compose for an article hero: atmosphere and place matter; keep product UI legible if a reference screenshot is provided.',
		});
	} catch (error) {
		if (error instanceof AgentError) {
			throw new ArticleWorkflowError(error.message, error.status ?? 502, error.code ?? 'media_generation_failed');
		}
		throw error;
	}

	let asset = generated.asset;
	if (!generated.reused) {
		const analyzed = await runAssetVisionAnalysis({
			ownerUserId,
			assetId: generated.asset.id,
			brandName: brain.identity.name,
			force: true,
		});
		if (analyzed) asset = { ...asset, altText: analyzed.altText || asset.altText, visionAnalysis: analyzed.visionAnalysis, visionAnalysisStatus: analyzed.visionAnalysisStatus };
	}

	const url = asset.url ?? null;
	const verified =
		role === 'hero'
			? url
				? await verifyHeroDestinationDelivery(ownerUserId, article, workspace, url)
				: { ok: false, error: 'The image has no delivery URL.' }
			: await verifyMediaUrl(url ?? undefined);

	const now = new Date().toISOString();
	const candidate = {
		assetId: asset.id,
		url: url ?? '',
		prompt,
		concept,
		createdAt: now,
		estimatedCostUsd: generated.estimatedCostUsd,
		selected: true,
	};
	const previousCandidates = brief.candidates.map((item) => ({ ...item, selected: false }));
	creative[role] = {
		...brief,
		suggestedConcept: suggested,
		concept,
		prompt,
		negativeConstraints,
		revisionInstructions: '',
		referenceAssetIds,
		brandStyleNotes,
		dimensions: aspectRatioForRole(role),
		lastCostUsd: generated.estimatedCostUsd,
		estimatedCostUsd: generated.estimatedCostUsd,
		similarityWarning: conceptSimilarityWarning(
			concept,
			previousCandidates.map((item) => item.concept),
		),
		history: [
			{
				at: now,
				prompt,
				concept,
				assetId: asset.id,
				url,
				reused: generated.reused,
				estimatedCostUsd: generated.estimatedCostUsd,
				revisionInstructions: options.revisionInstructions || null,
			},
			...brief.history,
		].slice(0, 20),
		candidates: [candidate, ...previousCandidates.filter((item) => item.assetId !== asset.id)].slice(0, 12),
	};

	const visionAlt = asset.altText?.trim();
	const needsManualAlt = !visionAlt || /^Visual supporting:/i.test(visionAlt) || asset.visionAnalysisStatus === 'skipped' || asset.visionAnalysisStatus === 'failed';
	if (role === 'hero') {
		workspace.media.heroAssetId = asset.id;
		workspace.media.heroUrl = url;
		workspace.media.heroAlt = needsManualAlt
			? workspace.media.heroAlt || ''
			: visionAlt || workspace.media.heroAlt;
		if (needsManualAlt && !workspace.media.heroAlt) {
			workspace.media.deliveryError = verified.error;
		}
		article.featuredAssetId = asset.id;
		workspace.media.deliveryVerified = verified.ok;
		workspace.media.deliveryError = verified.error;
	} else {
		workspace.media.ogAssetId = asset.id;
		workspace.media.ogUrl = url;
		workspace.media.ogAlt = needsManualAlt ? workspace.media.ogAlt || '' : visionAlt || workspace.media.ogAlt;
	}
	article.workspace = workspace;
	await persist(article);
	try {
		await reviewCurrentRevision({
			article,
			brain,
			taxonomy: await taxonomyFor(article),
			ai: getIntelligenceAi(),
			ownerUserId,
		});
	} catch {
		// Media save must succeed even if a follow-up review fails.
	}
	return persist(article);
}

export async function replaceArticleMedia(ownerUserId: string, articleId: string, assetId: string, role: 'hero' | 'og'): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const asset = await getNativeContentStore().getAsset(ownerUserId, assetId);
	if (!asset || asset.brandId !== article.brandId) {
		throw new ArticleWorkflowError('That image is not in this brand library.', 404, 'asset_not_found');
	}
	const workspace = ensureWorkspace(article);
	const creative = ensureMediaCreative(workspace);
	const verified =
		role === 'hero' && asset.url
			? await verifyHeroDestinationDelivery(ownerUserId, article, workspace, asset.url)
			: await verifyMediaUrl(asset.url);
	if (role === 'hero') {
		if (workspace.media.acceptedHeroAssetId && workspace.media.acceptedHeroAssetId !== asset.id) {
			// Keep the previously accepted asset id for history; selection replaces the active pointer only.
		}
		workspace.media.heroAssetId = asset.id;
		workspace.media.heroUrl = asset.url ?? null;
		workspace.media.heroAlt = asset.altText || workspace.media.heroAlt || '';
		article.featuredAssetId = asset.id;
		workspace.media.deliveryVerified = verified.ok;
		workspace.media.deliveryError = verified.error;
		workspace.media.acceptedHeroAssetId = asset.id;
	} else {
		workspace.media.ogAssetId = asset.id;
		workspace.media.ogUrl = asset.url ?? null;
		workspace.media.ogAlt = asset.altText || workspace.media.ogAlt || '';
		workspace.media.acceptedOgAssetId = asset.id;
	}
	creative[role] = {
		...creative[role],
		candidates: [
			{
				assetId: asset.id,
				url: asset.url ?? '',
				prompt: asset.generationPrompt || creative[role].prompt,
				concept: String(asset.provenance.concept ?? creative[role].concept),
				createdAt: new Date().toISOString(),
				estimatedCostUsd: null,
				selected: true,
			},
			...creative[role].candidates.map((item) => ({ ...item, selected: item.assetId === asset.id })),
		]
			.filter((item, index, all) => all.findIndex((other) => other.assetId === item.assetId) === index)
			.slice(0, 12),
	};
	article.workspace = workspace;
	await persist(article);
	try {
		const brain = await requireBrand(ownerUserId, article.brandId);
		await reviewCurrentRevision({
			article,
			brain,
			taxonomy: await taxonomyFor(article),
			ai: getIntelligenceAi(),
			ownerUserId,
		});
	} catch {
		// Selection must persist even if review refresh fails.
	}
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

/** Looks up the CMS draft for the article's external ID without changing anything. */
export async function lookupArticleDraft(ownerUserId: string, articleId: string, externalId?: string) {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) throw new ArticleWorkflowError('Choose a website destination first.', 400, 'destination_required');
	const id = externalId?.trim() ? normaliseExternalId(externalId) : workspace.externalId || workspace.cms.externalId;
	if (!id) throw new ArticleWorkflowError('Enter an external ID to look up.', 400, 'external_id_required');
	const { adapter, connection } = await resolveConnection(ownerUserId, article.brandId, workspace.destinationId).catch(asWorkflowError);
	try {
		return { externalId: id, draft: await adapter.lookupDraft(connection, id) };
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Draft lookup failed.', 502, 'cms_lookup_failed');
	}
}

async function uploadIfChanged(
	adapter: Awaited<ReturnType<typeof resolveConnection>>['adapter'],
	connection: Awaited<ReturnType<typeof resolveConnection>>['connection'],
	url: string | undefined,
	previous: { url?: string | null; mediaId?: string | null },
	meta: { alt: string; credit: string; license: string; filename: string },
): Promise<string | undefined> {
	if (!url) return undefined;
	if (previous.url === url && previous.mediaId) return previous.mediaId;
	const image = await fetchAllowedImage(url);
	if (!image.ok) throw new ArticleWorkflowError(image.error, 422, 'media_unavailable');
	if (image.bytes.length > connection.destination.settings.media.maxBytes) throw new ArticleWorkflowError('The image is larger than this destination accepts.', 422, 'media_too_large');
	const uploaded = await adapter.uploadMedia(connection, { bytes: image.bytes, mimeType: image.mimeType, ...meta });
	if (!uploaded.ok) throw new ArticleWorkflowError(uploaded.error, 422, 'media_upload_failed');
	return uploaded.mediaId;
}

export async function submitArticleDraft(ownerUserId: string, articleId: string, options?: { correction?: boolean }): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) throw new ArticleWorkflowError('Choose a website destination first.', 400, 'destination_required');
	const externalId = workspace.externalId || workspace.cms.externalId;
	if (!externalId) throw new ArticleWorkflowError('Set an external ID so the CMS updates the same draft every time.', 400, 'external_id_required');
	if (!article.categories[0]) throw new ArticleWorkflowError('Choose a destination category before sending the draft.', 400, 'category_required');
	if (!article.body.trim()) throw new ArticleWorkflowError('There is no draft to send.', 400, 'draft_missing');
	const structure = validateArticleStructure(article.body);
	if (!structure.ok) {
		throw new ArticleWorkflowError(`The draft has structural problems and was not sent: ${structure.issues.filter((issue) => issue.severity === 'critical').map((issue) => issue.message).join(' ')}`, 409, 'structure_invalid');
	}
	const seoIssues = metadataFieldIssues(article);
	if (seoIssues.length) {
		throw new ArticleWorkflowError(`Fix SEO metadata before sending: ${seoIssues.map((issue) => issue.message).join(' ')}`, 409, 'metadata_invalid');
	}
	const { adapter, connection, destination } = await resolveConnection(ownerUserId, article.brandId, workspace.destinationId).catch(asWorkflowError);
	const taxonomy = await taxonomyFor(article);
	if (!taxonomy) throw new ArticleWorkflowError('Sync the destination taxonomy before sending.', 422, 'taxonomy_unavailable');
	if (!taxonomy.categories.some((category) => category.id === article.categories[0])) {
		throw new ArticleWorkflowError(`The category “${article.categories[0]}” is no longer in ${destination.name}. Choose another category; CCE will not substitute one.`, 409, 'category_stale');
	}
	const blocking = compatibilityFor(article, taxonomy, destination.provider).issues.filter((issue) => issue.severity === 'blocking');
	if (blocking.length) {
		throw new ArticleWorkflowError(`The draft contains content ${destination.name} cannot store, so it was not sent: ${blocking.map((issue) => issue.message).join(' ')}`, 409, 'destination_incompatible');
	}
	let existing;
	try {
		existing = await adapter.lookupDraft(connection, externalId);
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Draft lookup failed.', 502, 'cms_lookup_failed');
	}
	const correction = options?.correction === true;
	if (existing.exists && existing.status === 'published' && !correction) {
		throw new ArticleWorkflowError('The CMS entry for this external ID is published. CCE does not change published entries. Edit it in the CMS.', 409, 'cms_published');
	}
	if (correction && !existing.exists) {
		throw new ArticleWorkflowError('There is no published CMS entry to correct.', 404, 'cms_missing');
	}
	const mode = correction ? 'correction' : existing.exists ? 'proposal' : 'update';
	const baseRevision = existing.exists ? existing.revision : undefined;
	const hero = workspace.media.heroUrl && workspace.media.deliveryVerified ? workspace.media.heroUrl : undefined;
	const credit = workspace.media.credit || 'Crisp Content Engine';
	const license = workspace.media.license || `Generated for ${destination.name} editorial use`;
	const previousHero = { url: workspace.cms.heroSourceUrl, mediaId: workspace.cms.heroMediaId };
	const heroMediaId = await uploadIfChanged(adapter, connection, hero, previousHero, {
		alt: workspace.media.heroAlt || article.title,
		credit,
		license,
		filename: mediaFilename(article.slug, 'hero', 'image/jpeg'),
	});
	const og = workspace.media.ogUrl && workspace.media.ogUrl !== hero ? workspace.media.ogUrl : undefined;
	const previousOg = { url: workspace.cms.ogSourceUrl, mediaId: workspace.cms.ogMediaId };
	const ogMediaId = await uploadIfChanged(adapter, connection, og, previousOg, {
		alt: workspace.media.ogAlt || article.title,
		credit,
		license,
		filename: mediaFilename(article.slug, 'og', 'image/jpeg'),
	});
	const payload = mapArticleRecordToFolianDraft(article, { externalId, baseRevision, mode, heroMediaId, ogMediaId, taxonomy });
	if (destination.settings.defaultAuthor) payload.author = destination.settings.defaultAuthor;
	const result = await adapter.submitDraft(connection, { externalId, baseRevision, mode, payload });
	const now = new Date().toISOString();
	workspace.cms.externalId = externalId;
	workspace.externalId = externalId;
	workspace.cms.lastSyncAt = now;
	workspace.cms.mode = mode;
	if (!result.ok) {
		workspace.cms.lastError = result.error;
		article.workspace = workspace;
		await persist(article);
		throw new ArticleWorkflowError(result.error, 422, 'cms_rejected');
	}
	workspace.cms.lastError = null;
	workspace.cms.draftUrl = result.previewUrl ?? result.adminUrl ?? workspace.cms.draftUrl;
	workspace.cms.revision = typeof result.revision === 'number' ? result.revision : baseRevision ?? workspace.cms.revision;
	workspace.cms.submittedRevisionId = workspace.revision?.id ?? null;
	workspace.cms.remoteStatus = 'draft';
	if (heroMediaId) {
		workspace.cms.heroMediaId = heroMediaId;
		workspace.cms.heroSourceUrl = hero ?? null;
	}
	if (ogMediaId) {
		workspace.cms.ogMediaId = ogMediaId;
		workspace.cms.ogSourceUrl = og ?? null;
	}
	article.workspace = workspace;
	return persist(article);
}

export function previewArticleStructuralRepair(_ownerUserId: string, article: ArticleRecord): StructuralRepairPreview {
	if (!article.body.trim()) throw new ArticleWorkflowError('There is no draft to repair.', 400, 'draft_missing');
	return previewStructuralRepair(article.body);
}

/** Creates a revision with the duplicate page-title H1 removed for CMS destinations. */
export async function applyArticleCmsTitleCleanup(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.destinationId) {
		throw new ArticleWorkflowError('Choose a website destination before removing the in-body title.', 400, 'destination_required');
	}
	const cleaned = stripCmsTitleHeading(article.body, article.title);
	if (!cleaned || cleaned === article.body.trim()) {
		throw new ArticleWorkflowError('There is no duplicate page title heading to remove.', 400, 'heading_clean');
	}
	commitRevision(article, cleaned, 'structural_repair', 'Removed the in-body H1 so the CMS title is the only page heading.', { refreshMetadata: false });
	return persist(article);
}

export async function applyArticleStructuralRepair(ownerUserId: string, articleId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	assertNotApproved(article, 'Structural repair');
	const preview = previewStructuralRepair(article.body);
	if (!preview.canApply) {
		throw new ArticleWorkflowError(
			preview.changes.length
				? 'The structural repair cannot be applied safely. Review the preview.'
				: 'No deterministic structural repairs are available. Use Improve article with AI for the remaining issues.',
			409,
			'structure_repair_unavailable',
		);
	}
	const workspace = ensureWorkspace(article);
	article.workspace = workspace;
	commitRevision(article, preview.after, 'structural_repair', `Removed ${preview.changes.length} duplicate heading line${preview.changes.length === 1 ? '' : 's'}.`, { refreshMetadata: false });
	article.approval = { required: true, approver: 'human', status: 'pending' };
	workspace.approvedAt = null;
	workspace.approvedRevisionId = null;
	if (article.status === 'approved') article.status = 'draft';
	const after = validateArticleStructure(article.body);
	if (!after.ok) {
		throw new ArticleWorkflowError(`The repaired draft still fails validation: ${after.issues.map((issue) => issue.message).join(' ')}`, 422, 'structure_still_invalid');
	}
	return persist(article);
}

export async function regenerateArticleSeo(ownerUserId: string, articleId: string, options?: { useAi?: boolean; overwriteEdited?: boolean }): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	if (!article.body.trim()) throw new ArticleWorkflowError('Write or generate a draft before regenerating SEO metadata.', 400, 'draft_missing');
	const workspace = ensureWorkspace(article);
	const generated = options?.useAi
		? (await generateArticleMetadataWithAi(article, getIntelligenceAi(), ownerUserId)).metadata
		: generateArticleMetadata(article);
	applyGeneratedMetadata(article, generated, { overwriteEdited: options?.overwriteEdited });
	if (options?.overwriteEdited) workspace.seoEdited = {};
	const issues = metadataFieldIssues(article);
	if (issues.length) throw new ArticleWorkflowError(issues.map((issue) => issue.message).join(' '), 422, 'metadata_invalid');
	article.workspace = workspace;
	return persist(article);
}

export async function previewArticleEditorialImprovement(ownerUserId: string, articleId: string): Promise<ArticleImprovementPreview> {
	const article = await requireArticle(ownerUserId, articleId);
	const workspace = ensureWorkspace(article);
	if (!workspace.briefApprovedAt) throw new ArticleWorkflowError('Approve the brief before using AI improvements.', 400, 'brief_not_approved');
	if (!workspace.research?.approved) throw new ArticleWorkflowError('Approve the research before using AI improvements.', 400, 'research_not_approved');
	assertNotApproved(article, 'AI improvement');
	const revision = ensureRevision(article);
	if (!revision) throw new ArticleWorkflowError('There is no saved revision to improve.', 400, 'draft_missing');
	if (await activeJob(ownerUserId, article, 'article_revision')) {
		throw new ArticleWorkflowError('A revision job is running. Wait for it to finish.', 409, 'revision_in_progress');
	}
	const brain = await requireBrand(ownerUserId, article.brandId);
	const findings = workspace.editorial.findings.filter((finding) => !finding.revisionId || finding.revisionId === revision.id);
	try {
		return await previewArticleImprovement({
			ownerUserId,
			article,
			brand: brain,
			brief: workspace.brief,
			findings,
		});
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Improvement preview failed.', 502, 'improve_preview_failed');
	}
}

export async function applyArticleEditorialImprovement(ownerUserId: string, articleId: string, proposedBody: string, baseRevisionId: string): Promise<ArticleRecord> {
	const article = await requireArticle(ownerUserId, articleId);
	assertNotApproved(article, 'AI improvement');
	const workspace = ensureWorkspace(article);
	const revision = ensureRevision(article);
	if (!revision || revision.id !== baseRevisionId) {
		throw new ArticleWorkflowError('The article changed since the preview. Run Improve article with AI again.', 409, 'improve_stale');
	}
	const after = validateArticleStructure(proposedBody);
	if (!after.ok) {
		throw new ArticleWorkflowError(`The improved draft failed structure validation: ${after.issues.filter((issue) => issue.severity === 'critical').map((issue) => issue.message).join(' ')}`, 422, 'structure_invalid');
	}
	if (articleWordCount(proposedBody) < revision.wordCount * 0.8) {
		throw new ArticleWorkflowError('The improved draft is much shorter than the current revision, so it was not saved.', 422, 'improve_too_short');
	}
	article.workspace = workspace;
	commitRevision(article, proposedBody, 'improvement', 'Editorial improvements applied from preview.', { refreshMetadata: false });
	article.approval = { required: true, approver: 'human', status: 'pending' };
	workspace.approvedAt = null;
	workspace.approvedRevisionId = null;
	if (article.status === 'approved') article.status = 'draft';
	const brain = await requireBrand(ownerUserId, article.brandId);
	const taxonomy = await taxonomyFor(article);
	try {
		await reviewCurrentRevision({ article, brain, taxonomy, ai: getIntelligenceAi(), ownerUserId });
	} catch (error) {
		throw new ArticleWorkflowError(error instanceof Error ? error.message : 'Review failed after improvement.', 502, 'review_failed');
	}
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
	ensureRevision(article);
	const gate = articleApprovalGate(article);
	if (!gate.ok) throw new ArticleWorkflowError(gate.message, 409, gate.code);
	const workspace = ensureWorkspace(article);
	if (imagesRequired(workspace.imageRequirements) && !workspace.media.deliveryVerified) {
		throw new ArticleWorkflowError('Verify destination media delivery before approving this article.', 409, 'media_not_verified');
	}
	article.status = 'approved';
	article.approval = { required: true, approver: 'human', status: 'approved' };
	workspace.approvedAt = new Date().toISOString();
	workspace.approvedRevisionId = workspace.revision?.id ?? null;
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
			message: 'Privileged website publication is flagged on, and the CMS adapter has no live publish call. Publish the approved draft in the CMS, then record the URL here.',
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

export async function articleTaxonomy(ownerUserId: string, article: ArticleRecord) {
	if (article.ownerUserId !== ownerUserId) return null;
	return taxonomyFor(article);
}
