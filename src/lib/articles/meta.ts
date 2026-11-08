import type { ReviewFinding } from '@/lib/articles/editorialReview';
import type {
	ArticleEditorialFinding,
	ArticleRecord,
	ArticleWorkspace,
	EditorialDimension,
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

export function emptyWorkspace(partial?: Partial<ArticleWorkspace>): ArticleWorkspace {
	return {
		destinationId: partial?.destinationId ?? null,
		contentType: partial?.contentType ?? 'guide',
		workingTitle: partial?.workingTitle ?? '',
		researchRequirements: partial?.researchRequirements ?? '',
		internalLinking: partial?.internalLinking ?? '',
		imageRequirements: partial?.imageRequirements ?? '',
		briefApprovedAt: partial?.briefApprovedAt ?? null,
		externalId: partial?.externalId ?? null,
		researchId: partial?.researchId ?? null,
		assignedModelRole: partial?.assignedModelRole ?? 'LONG_FORM_WRITING',
		assignedModel: partial?.assignedModel ?? null,
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

export function toEditorialFindings(findings: ReviewFinding[]): ArticleEditorialFinding[] {
	return findings.map((finding, index) => ({
		id: `${finding.source}-${finding.code}-${index + 1}`,
		severity: finding.severity,
		code: finding.code,
		dimension: dimensionForCode(finding.code, (finding as ReviewFinding & { dimension?: string }).dimension),
		instruction: finding.instruction,
		source: finding.source,
		decision: 'pending' as const,
	}));
}

export function editorialStatusFromFindings(findings: ArticleEditorialFinding[], exhausted: boolean): ArticleWorkspace['editorial']['status'] {
	if (findings.length === 0) return 'ready';
	if (findings.some((finding) => finding.severity === 'critical')) return exhausted ? 'blocked' : 'findings';
	return 'findings';
}

export type GateResult = { ok: true } | { ok: false; code: string; message: string };

export function articleApprovalGate(article: ArticleRecord): GateResult {
	const workspace = ensureWorkspace(article);
	if (workspace.editorial.status === 'not_run') {
		return { ok: false, code: 'review_required', message: 'Run editorial review before approval.' };
	}
	if (workspace.editorial.exhausted && workspace.editorial.status !== 'ready') {
		return {
			ok: false,
			code: 'review_not_approval',
			message: 'The review cycle limit is used up. That is not approval. Edit the draft and rerun review.',
		};
	}
	if (workspace.editorial.findings.some((finding) => finding.severity === 'critical')) {
		return { ok: false, code: 'critical_findings', message: 'Critical editorial findings are still open.' };
	}
	return { ok: true };
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

export function recommendArticleStructure(topic: string, findingTexts: string[]): Array<{ id: string; heading: string; purpose: string }> {
	const subject = topic.trim() || 'the topic';
	const sourced = findingTexts.map((text) => text.trim()).filter(Boolean).slice(0, 4);
	const sections = [
		{ id: 'structure-1', heading: `What ${subject} asks of the reader`, purpose: 'State the search intent in the reader’s words. Do not add proof that is not in the brief.' },
		...sourced.map((text, index) => ({
			id: `structure-${index + 2}`,
			heading: text.length > 80 ? `${text.slice(0, 77)}…` : text,
			purpose: 'Develop only this stored finding. Keep its source attached.',
		})),
		{
			id: `structure-${sourced.length + 2}`,
			heading: 'A practical sequence',
			purpose: 'Turn the approved findings into steps the reader can follow. Leave gaps named when proof is missing.',
		},
	];
	return sections;
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
	if (!workspace.researchSummary.retrievedAt) {
		return {
			stage: 'Research',
			action: 'Research the topic',
			detail: 'Stored sources and gaps stay attached to this article. Nothing is invented to fill a missing source.',
		};
	}
	if (!workspace.briefApprovedAt) {
		return {
			stage: 'Brief',
			action: 'Approve the brief',
			detail: 'Check the title, search intent, and recommended structure, then approve the brief.',
		};
	}
	if (!article.body.trim()) {
		return {
			stage: 'Draft',
			action: 'Generate the draft',
			detail: `Target ${article.targetWords.toLocaleString()} words. The model is the LONG_FORM_WRITING role.`,
		};
	}
	if (workspace.editorial.status === 'not_run') {
		return {
			stage: 'Review',
			action: 'Run editorial review',
			detail: 'Review checks search intent, completeness, sources, voice, SEO, and category fit.',
		};
	}
	if (workspace.editorial.exhausted && workspace.editorial.status !== 'ready') {
		return {
			stage: 'Review blocked',
			action: 'Edit the draft, then rerun review',
			detail: 'The review cycle limit is used up. That is not approval.',
		};
	}
	if (workspace.editorial.findings.some((finding) => finding.severity === 'critical')) {
		return {
			stage: 'Review',
			action: 'Revise the open findings',
			detail: 'Accept the findings you want applied, or edit the draft yourself, then rerun review.',
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
