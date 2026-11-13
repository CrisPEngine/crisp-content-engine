import type { ReviewFinding } from '@/lib/articles/editorialReview';
import type {
	ArticleBriefDetails,
	ArticleEditorialFinding,
	ArticleRecord,
	ArticleWorkspace,
	EditorialDimension,
	FindingTier,
	WordTarget,
} from '@/lib/articles/types';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';

export function reviewCycleLimit(): number {
	const raw = Number(process.env.CCE_ARTICLE_REVIEW_CYCLES ?? '2');
	if (!Number.isFinite(raw) || raw < 0) return 2;
	return Math.floor(raw);
}

export function imagesRequired(imageRequirements: string | undefined): boolean {
	const value = (imageRequirements ?? '').trim();
	if (!value) return true;
	return !/^(none|no image|text only|text-only)$/i.test(value);
}

export function emptyBriefDetails(): ArticleBriefDetails {
	return {
		secondaryKeywords: '',
		questions: '',
		avoid: '',
		tone: '',
		cta: '',
		requiredLinks: '',
		referenceMaterial: '',
		instructions: '',
	};
}

export function splitLines(value: string | undefined): string[] {
	return (value ?? '')
		.split(/\n|;/)
		.map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
		.filter(Boolean);
}

export function emptyWorkspace(partial?: Partial<ArticleWorkspace>): ArticleWorkspace {
	return {
		destinationId: partial?.destinationId ?? null,
		contentType: partial?.contentType ?? 'guide',
		workingTitle: partial?.workingTitle ?? '',
		researchRequirements: partial?.researchRequirements ?? '',
		internalLinking: partial?.internalLinking ?? '',
		imageRequirements: partial?.imageRequirements ?? '',
		briefApprovedAt: partial?.briefApprovedAt ?? null,
		briefChangedAfterApproval: partial?.briefChangedAfterApproval ?? false,
		brief: { ...emptyBriefDetails(), ...(partial?.brief ?? {}) },
		briefSuggestions: partial?.briefSuggestions ?? null,
		externalId: partial?.externalId ?? null,
		researchId: partial?.researchId ?? null,
		research: partial?.research,
		assignedModelRole: partial?.assignedModelRole ?? 'LONG_FORM_WRITING',
		assignedModel: partial?.assignedModel ?? null,
		revision: partial?.revision ?? null,
		revisionJob: partial?.revisionJob ?? {
			jobId: null,
			status: 'idle',
			stage: null,
			startedAt: null,
			updatedAt: null,
			error: null,
			baseRevisionId: null,
			resultRevisionId: null,
		},
		categorySuggestion: partial?.categorySuggestion ?? null,
		wordTarget: partial?.wordTarget,
		sectionPlan: partial?.sectionPlan,
		taxonomyRef: partial?.taxonomyRef ?? null,
		generation: partial?.generation ?? {
			jobId: null,
			model: null,
			promptTokens: 0,
			completionTokens: 0,
			estimatedCostUsd: null,
			status: 'idle',
			error: null,
		},
		editorial: partial?.editorial ?? {
			status: 'not_run',
			cyclesUsed: 0,
			maxCycles: reviewCycleLimit(),
			findings: [],
			lastRunAt: null,
			exhausted: false,
		},
		media: partial?.media ?? {
			heroAssetId: null,
			ogAssetId: null,
			heroUrl: null,
			ogUrl: null,
			heroAlt: '',
			ogAlt: '',
			credit: '',
			license: '',
			deliveryVerified: false,
			deliveryError: null,
		},
		cms: partial?.cms ?? {
			externalId: partial?.externalId ?? null,
			revision: null,
			draftUrl: null,
			lastSyncAt: null,
			lastError: null,
			mode: null,
		},
		editorialBrief: partial?.editorialBrief,
		editorialDesk: partial?.editorialDesk,
		intelligence: partial?.intelligence,
		exampleConsistency: partial?.exampleConsistency,
		approvedAt: partial?.approvedAt ?? null,
		approvedRevisionId: partial?.approvedRevisionId ?? null,
		schedule: partial?.schedule ?? {
			publishAt: null,
			destinationId: null,
			approvalRequired: true,
			status: 'unscheduled',
			blockedReason: null,
		},
		researchSummary: partial?.researchSummary ?? {
			retrievedAt: null,
			competitors: [],
			recommendedStructure: [],
			relatedArticleSlugs: [],
			relatedTools: [],
			searchIntent: '',
		},
	};
}

export function ensureWorkspace(article: ArticleRecord): ArticleWorkspace {
	return emptyWorkspace(article.workspace);
}

export const DEFAULT_WORD_TOLERANCE_PCT = 15;

/** The requested length, falling back to the stored target for articles created before word targets existed. */
export function wordTargetFor(article: Pick<ArticleRecord, 'targetWords' | 'workspace'>): WordTarget {
	const stored = article.workspace?.wordTarget;
	if (stored?.requested) return { ...stored, tolerancePct: stored.tolerancePct ?? DEFAULT_WORD_TOLERANCE_PCT };
	return { requested: article.targetWords, approved: null, tolerancePct: DEFAULT_WORD_TOLERANCE_PCT };
}

const DIMENSION_BY_CODE: Record<string, EditorialDimension> = {
	too_short: 'topic_completeness',
	unknown_category: 'category_accuracy',
	uncited_research: 'sources',
	repetition: 'writing_quality',
	missing_destination_resource: 'internal_linking',
	search_intent: 'search_intent',
	accuracy: 'accuracy',
	brand_voice: 'brand_voice',
	seo: 'seo',
	publication_readiness: 'publication_readiness',
};

export function dimensionForCode(code: string, hinted?: string): EditorialDimension {
	if (hinted && hinted in DIMENSION_BY_CODE) return DIMENSION_BY_CODE[hinted] ?? 'publication_readiness';
	const known = [
		'search_intent',
		'topic_completeness',
		'accuracy',
		'sources',
		'writing_quality',
		'brand_voice',
		'seo',
		'category_accuracy',
		'internal_linking',
		'publication_readiness',
	] as const;
	if ((known as readonly string[]).includes(hinted ?? '')) return hinted as EditorialDimension;
	return DIMENSION_BY_CODE[code] ?? 'publication_readiness';
}

export function toEditorialFindings(findings: ReviewFinding[], revisionId: string | null = null): ArticleEditorialFinding[] {
	return findings.map((finding, index) => ({
		id: `${revisionId ? revisionId.slice(0, 8) : 'r'}-${finding.source}-${finding.code}-${index + 1}`,
		severity: finding.severity,
		code: finding.code,
		dimension: dimensionForCode(finding.code, finding.dimension),
		instruction: finding.instruction,
		source: finding.source,
		decision: 'pending' as const,
		rejectable: finding.rejectable !== false,
		revisionId,
		decidedAt: null,
		appliedInRevisionId: null,
		note: null,
		section: finding.section ?? null,
		evidence: finding.evidence ?? [],
		explanation: finding.explanation ?? null,
		proposedFix: finding.proposedFix ?? null,
		fix: finding.fix ?? null,
	}));
}

/** Blocking findings stop approval and submission; important ones should be fixed; optional ones are suggestions. */
export function findingTier(finding: Pick<ArticleEditorialFinding, 'severity'>): FindingTier {
	return finding.severity === 'critical' ? 'blocking' : finding.severity === 'major' ? 'important' : 'optional';
}

/** The instruction a revision should follow: the editor's wording when they edited it. */
export function effectiveInstruction(finding: Pick<ArticleEditorialFinding, 'instruction' | 'editedInstruction' | 'section'>): string {
	const text = finding.editedInstruction?.trim() || finding.instruction;
	return finding.section && !text.includes(finding.section) ? `In “${finding.section}”: ${text}` : text;
}

/** Findings that still need action: not rejected, applied or superseded. */
export function isOpenFinding(finding: ArticleEditorialFinding): boolean {
	return finding.decision === 'pending' || finding.decision === 'accepted';
}

export function openCriticalFindings(workspace: ArticleWorkspace): ArticleEditorialFinding[] {
	return workspace.editorial.findings.filter((finding) => finding.severity === 'critical' && isOpenFinding(finding));
}

export function editorialStatusFromFindings(findings: ArticleEditorialFinding[], exhausted: boolean): ArticleWorkspace['editorial']['status'] {
	const open = findings.filter(isOpenFinding);
	if (open.length === 0) return 'ready';
	if (open.some((finding) => finding.severity === 'critical')) return exhausted ? 'blocked' : 'findings';
	return 'findings';
}

export type GateResult = { ok: true } | { ok: false; code: string; message: string };

export function articleApprovalGate(article: ArticleRecord): GateResult {
	const workspace = ensureWorkspace(article);
	if (workspace.revisionJob?.status === 'queued' || workspace.revisionJob?.status === 'processing') {
		return { ok: false, code: 'revision_in_progress', message: 'Wait for the revision job to finish.' };
	}
	if (workspace.editorial.status === 'not_run') {
		return { ok: false, code: 'review_required', message: 'Run editorial review before approval.' };
	}
	if (workspace.revision && workspace.editorial.reviewedRevisionId !== workspace.revision.id) {
		return {
			ok: false,
			code: 'review_stale',
			message: `The last review covered revision ${workspace.editorial.reviewedRevisionNumber ?? 'unknown'}. The current revision is ${workspace.revision.number}. Rerun review.`,
		};
	}
	const critical = openCriticalFindings(workspace);
	if (critical.length) {
		return {
			ok: false,
			code: workspace.editorial.exhausted ? 'review_not_approval' : 'critical_findings',
			message: workspace.editorial.exhausted
				? `${critical.length} critical finding${critical.length === 1 ? '' : 's'} remain and the revision cycle limit is used up. Edit the draft yourself and rerun review. Using up the limit is not approval.`
				: `${critical.length} critical finding${critical.length === 1 ? '' : 's'} remain open. Apply or resolve them before approval.`,
		};
	}
	return { ok: true };
}

export function articleLifecycle(article: ArticleRecord) {
	const workspace = ensureWorkspace(article);
	return {
		savedInCce: Boolean(article.body.trim()),
		revisionNumber: workspace.revision?.number ?? null,
		submittedToCms: Boolean(workspace.cms.lastSyncAt && !workspace.cms.lastError),
		cmsCurrent: Boolean(workspace.cms.submittedRevisionId && workspace.cms.submittedRevisionId === workspace.revision?.id),
		approved: article.approval.status === 'approved',
		scheduled: workspace.schedule.status === 'scheduled' || workspace.schedule.status === 'due',
		published: article.status === 'published',
	};
}

export function articleScheduleGate(article: ArticleRecord, input: { destinationId: string; publishAt: string }): GateResult {
	if (article.approval.status !== 'approved' || article.status !== 'approved') {
		return { ok: false, code: 'approval_required', message: 'Schedule a website article only after a person approves it.' };
	}
	const approval = articleApprovalGate(article);
	if (!approval.ok) return approval;
	const workspace = ensureWorkspace(article);
	if (!input.destinationId) {
		return { ok: false, code: 'destination_required', message: 'Choose a website destination before scheduling.' };
	}
	const when = Date.parse(input.publishAt);
	if (!Number.isFinite(when)) {
		return { ok: false, code: 'invalid_time', message: 'Choose a publication date and time.' };
	}
	if (imagesRequired(workspace.imageRequirements) && !workspace.media.deliveryVerified) {
		return {
			ok: false,
			code: 'media_not_verified',
			message: 'Verify that the hero image can be delivered to the destination before scheduling.',
		};
	}
	return { ok: true };
}

/**
 * Suggests sections from the questions in the brief. Research findings are evidence for sections, not headings,
 * so they are never copied into the structure.
 */
export function recommendArticleStructure(topic: string, questions: string[]): Array<{ id: string; heading: string; purpose: string }> {
	const subject = topic.trim() || 'the topic';
	const asked = questions.map((question) => question.trim()).filter(Boolean).slice(0, 6);
	if (asked.length) {
		return asked.map((question, index) => ({
			id: `structure-${index + 1}`,
			heading: question.length > 90 ? `${question.slice(0, 87)}…` : question,
			purpose: 'Answer this question from the brief with approved research and practical steps.',
		}));
	}
	return [
		{ id: 'structure-1', heading: `What ${subject} involves`, purpose: 'State what the reader is trying to do and what they will have at the end.' },
		{ id: 'structure-2', heading: 'A practical sequence', purpose: 'Give the steps in order, using approved research for each step.' },
		{ id: 'structure-3', heading: 'Common problems and how to fix them', purpose: 'Name the problems readers hit and the fix for each.' },
		{ id: 'structure-4', heading: 'What to do next', purpose: 'Close with the next action. Keep any brand mention useful to the reader.' },
	];
}

export function matchingTools(taxonomy: DestinationTaxonomy | null, haystack: string): Array<{ slug: string; label: string }> {
	if (!taxonomy) return [];
	return taxonomy.tools
		.filter((tool) => (tool.linkWhenTopicMatches ? new RegExp(tool.linkWhenTopicMatches, 'i').test(haystack) : false))
		.map((tool) => ({ slug: tool.slug, label: tool.label }));
}

export function relatedArticleSlugs(articles: ArticleRecord[], currentId: string, topic: string): string[] {
	const words = new Set(topic.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
	return articles
		.filter((article) => article.id !== currentId && article.slug)
		.filter((article) => {
			const haystack = `${article.title} ${article.topic}`.toLowerCase();
			return [...words].some((word) => haystack.includes(word));
		})
		.slice(0, 5)
		.map((article) => article.slug);
}

export type ArticleListItem = {
	id: string;
	brandId: string;
	title: string;
	destination: string | null;
	category: string | null;
	contentType: string;
	status: ArticleRecord['status'];
	scheduleStatus: ArticleWorkspace['schedule']['status'];
	wordCount: number;
	updatedAt: string;
	assignedModel: string | null;
	editorialStatus: ArticleWorkspace['editorial']['status'];
	publishedUrl: string | null;
	generationStatus: ArticleWorkspace['generation']['status'];
	generationError: string | null;
	revisionNumber: number | null;
	submittedToCms: boolean;
	approved: boolean;
};

export function toListItem(article: ArticleRecord): ArticleListItem {
	const workspace = ensureWorkspace(article);
	return {
		id: article.id,
		brandId: article.brandId,
		title: article.title || workspace.workingTitle || article.topic,
		destination: workspace.destinationId,
		category: article.categories[0] ?? null,
		contentType: workspace.contentType,
		status: article.status,
		scheduleStatus: workspace.schedule.status,
		wordCount: article.wordCount,
		updatedAt: article.updatedAt,
		assignedModel: workspace.assignedModel ?? workspace.assignedModelRole,
		editorialStatus: workspace.editorial.status,
		publishedUrl: article.publication?.url ?? null,
		generationStatus: workspace.generation.status,
		generationError: workspace.generation.error,
		revisionNumber: workspace.revision?.number ?? null,
		submittedToCms: Boolean(workspace.cms.lastSyncAt && !workspace.cms.lastError),
		approved: article.approval.status === 'approved',
	};
}

export function articleNextStep(article: ArticleRecord): { stage: string; action: string; detail: string } {
	const workspace = ensureWorkspace(article);
	if (workspace.generation.status === 'queued' || workspace.generation.status === 'processing') {
		return {
			stage: 'Generating',
			action: 'Wait for the draft',
			detail: 'Generation is running as a background job. This page updates when it finishes or fails.',
		};
	}
	if (workspace.generation.status === 'failed') {
		return {
			stage: 'Generation failed',
			action: 'Retry the job',
			detail: workspace.generation.error || 'The draft was not saved. Retry uses this same article.',
		};
	}
	if (workspace.revisionJob?.status === 'queued' || workspace.revisionJob?.status === 'processing') {
		return {
			stage: 'Revising',
			action: 'Wait for the revision',
			detail: 'Accepted recommendations are being applied as a background job. Review reruns on the new revision.',
		};
	}
	if (!workspace.briefApprovedAt) {
		return {
			stage: 'Brief',
			action: 'Complete and approve the brief',
			detail: workspace.briefChangedAfterApproval
				? 'The brief changed after approval. Approve it again before research and generation use it.'
				: 'Check the title, search intent, questions and tone, then approve the brief.',
		};
	}
	const research = workspace.research;
	if (!research || research.status === 'empty') {
		return {
			stage: 'Research',
			action: 'Research the topic',
			detail: 'Research runs against the approved brief. You can edit, add to and remove findings before approving them.',
		};
	}
	if (!research.approved) {
		return {
			stage: 'Research',
			action: 'Review and approve the research',
			detail: 'Generation uses only the research version you approve.',
		};
	}
	if (!article.body.trim()) {
		return {
			stage: 'Draft',
			action: 'Generate the draft',
			detail: `Target ${article.targetWords.toLocaleString()} words, using approved research version ${research.approved.version}.`,
		};
	}
	if (workspace.editorial.status === 'not_run' || (workspace.revision && workspace.editorial.reviewedRevisionId !== workspace.revision.id)) {
		return {
			stage: 'Review',
			action: 'Run editorial review',
			detail: `Review checks revision ${workspace.revision?.number ?? 1} against the approved brief.`,
		};
	}
	const critical = openCriticalFindings(workspace);
	if (critical.length && workspace.editorial.exhausted) {
		return {
			stage: 'Review blocked',
			action: 'Edit the draft, then rerun review',
			detail: 'The revision cycle limit is used up and critical findings remain. That is not approval.',
		};
	}
	if (critical.length) {
		return {
			stage: 'Review',
			action: 'Resolve the critical findings',
			detail: 'Accept the findings to fix, then apply accepted revisions. Approval stays blocked until none are open.',
		};
	}
	if (workspace.editorial.findings.some((finding) => finding.decision === 'accepted')) {
		return {
			stage: 'Review',
			action: 'Apply accepted revisions',
			detail: 'Accepted is not applied. Apply them to create a new revision and rerun review.',
		};
	}
	if (!article.categories[0]) {
		return {
			stage: 'Destination',
			action: 'Choose a category',
			detail: 'The category has to be one returned by the connected website.',
		};
	}
	if (imagesRequired(workspace.imageRequirements) && !workspace.media.deliveryVerified) {
		return {
			stage: 'Images',
			action: 'Generate and verify the hero',
			detail: workspace.media.deliveryError || 'The hero has to be delivered to the destination before the draft is ready.',
		};
	}
	if (workspace.cms.lastError) {
		return {
			stage: 'CMS',
			action: 'Read the submission error',
			detail: workspace.cms.lastError,
		};
	}
	if (!workspace.cms.lastSyncAt) {
		return {
			stage: 'CMS',
			action: 'Send to the CMS as a draft',
			detail: 'This submits an unpublished draft. It does not publish the article.',
		};
	}
	if (workspace.cms.submittedRevisionId && workspace.revision && workspace.cms.submittedRevisionId !== workspace.revision.id) {
		return {
			stage: 'CMS',
			action: 'Update the CMS draft',
			detail: `The CMS has an older revision. Revision ${workspace.revision.number} is saved in CCE only.`,
		};
	}
	return {
		stage: 'Draft submitted',
		action: 'Review the draft in the CMS',
		detail: 'The article stays unpublished. A later send updates the same external ID.',
	};
}

export function matchesArticleView(article: ArticleRecord, view: string): boolean {
	const workspace = ensureWorkspace(article);
	if (view === 'drafts') return article.status === 'brief' || article.status === 'draft';
	if (view === 'review') return article.status === 'review';
	if (view === 'approved') return article.status === 'approved' && workspace.schedule.status !== 'scheduled';
	if (view === 'scheduled') return workspace.schedule.status === 'scheduled' || workspace.schedule.status === 'due';
	if (view === 'published') return article.status === 'published';
	if (view === 'failed') return workspace.generation.status === 'failed';
	return true;
}

export function normaliseExternalId(value: string): string {
	const id = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '');
	if (!/^[a-z0-9][a-z0-9_-]{2,80}$/.test(id)) {
		throw new Error('External ID must be 3–81 characters and use letters, numbers, hyphens, or underscores.');
	}
	return id;
}

/**
 * Stable, destination-agnostic CMS identity for an article.
 * Prefer the article slug; fall back to a short article id so two articles never share a hard-coded ID.
 */
export function suggestCmsExternalId(input: {
	articleId: string;
	slug?: string | null;
	/** When the preferred id is already taken, append a short unique suffix. */
	disambiguate?: boolean;
}): string {
	const slugPart = (input.slug || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
	const shortId = input.articleId.replace(/-/g, '').slice(0, 10);
	const base = slugPart ? `cce_${slugPart}` : `cce_article_${shortId}`;
	const candidate = input.disambiguate ? `${base}_${shortId}` : base;
	return normaliseExternalId(candidate.slice(0, 81));
}

export function articleOwnsExternalId(
	article: Pick<ArticleRecord, 'id' | 'workspace'>,
	externalId: string,
): boolean {
	const workspace = article.workspace;
	const owned = workspace?.externalId || workspace?.cms?.externalId;
	return Boolean(owned && owned === externalId);
}
