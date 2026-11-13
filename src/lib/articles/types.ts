import type { DestinationDraftMode } from '@/lib/destinations/types';
import type { EvidenceLevel, SourceClass } from './sourceClass';

export type ArticleSection = {
	id: string;
	heading: string;
	purpose: string;
	body: string;
	claims: string[];
};

export type ArticleResearch = {
	sources: Array<{ label: string; kind: 'brand_brain' | 'supplied' | 'opportunity'; url?: string; retrievedAt?: string }>;
	claims: Array<{
		text: string;
		sourceLabel: string;
		confidence: 'stored' | 'supplied';
		sourceUrl?: string;
		kind?: ResearchItemKind;
		sourceClass?: SourceClass;
		evidenceLevel?: EvidenceLevel;
	}>;
	gaps: string[];
	usedExternalResearch?: boolean;
	packageVersion?: number;
};

export type ArticleSeo = {
	title: string;
	seoTitle: string;
	slug: string;
	excerpt: string;
	metaDescription: string;
	canonical: string | null;
	primaryKeyword: string | null;
	secondaryTopics: string[];
};

export type ArticlePublication = {
	destination: string;
	externalId?: string;
	url?: string;
	publishedAt?: string;
	method: 'cce' | 'external';
};

export const EDITORIAL_DIMENSIONS = [
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

export type EditorialDimension = (typeof EDITORIAL_DIMENSIONS)[number];

export const RECOMMENDATION_STATES = [
	'pending',
	'accepted',
	'rejected',
	'applied',
	'superseded',
	'resolved_auto',
	'dismissed',
] as const;

export type RecommendationState = (typeof RECOMMENDATION_STATES)[number];

export type ArticleEditorialFinding = {
	id: string;
	severity: 'critical' | 'major' | 'minor';
	code: string;
	dimension: EditorialDimension;
	instruction: string;
	source: 'deterministic' | 'llm';
	decision: RecommendationState;
	/** Structural findings are re-checked on every revision and cannot be dismissed by a person. */
	rejectable?: boolean;
	revisionId?: string | null;
	decidedAt?: string | null;
	appliedInRevisionId?: string | null;
	note?: string | null;
	/** Section heading the finding is about, when it is local to one section. */
	section?: string | null;
	/** Quoted text or counts that show the problem. */
	evidence?: string[];
	/** Why it matters to the reader or the site. */
	explanation?: string | null;
	/** Proposed replacement text, when a direct fix is possible. */
	proposedFix?: string | null;
	/** Set when an editor rewrote the instruction before applying it. */
	editedInstruction?: string | null;
	/** A deterministic edit that resolves the finding without a model call. */
	fix?: FindingFix | null;
};

export type FindingFix = { kind: 'unlink_repeats'; url: string; keepFirst: number };

export type FindingTier = 'blocking' | 'important' | 'optional';

export type ArticleRevisionRef = {
	id: string;
	number: number;
	contentHash: string;
	wordCount: number;
	createdAt: string;
	source: 'generation' | 'manual' | 'revision' | 'legacy' | 'structural_repair' | 'improvement';
	note?: string;
};

export type ArticleReviewRun = {
	revisionId: string;
	revisionNumber: number;
	contentHash: string;
	ranAt: string;
	findings: ArticleEditorialFinding[];
};

export type JobState = {
	jobId: string | null;
	status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
	stage: string | null;
	startedAt: string | null;
	updatedAt: string | null;
	error: string | null;
};

export const RESEARCH_ITEM_KINDS = ['topic', 'competitor', 'brand', 'user', 'recommendation'] as const;

export type ResearchItemKind = (typeof RESEARCH_ITEM_KINDS)[number];

export type ResearchPackageSource = {
	id: string;
	url: string;
	title: string;
	domain: string;
	retrievedAt: string | null;
	addedInVersion: number;
	origin: 'search' | 'page' | 'user';
	excluded: boolean;
	excludedReason: string | null;
	classification?: SourceClass;
};

export type ResearchPackageItem = {
	id: string;
	kind: ResearchItemKind;
	text: string;
	sourceIds: string[];
	supported: boolean;
	relevance: number;
	addedInVersion: number;
	excluded: boolean;
	excludedReason: string | null;
};

export type ResearchUpdate = {
	version: number;
	createdAt: string;
	kind: 'initial' | 'follow_up' | 'deeper' | 'manual' | 'migrated';
	question: string | null;
	researchId: string | null;
	summary: string;
};

export type ResearchSnapshot = {
	version: number;
	approvedAt: string;
	sources: ResearchPackageSource[];
	items: ResearchPackageItem[];
	notes: string;
	expertise: string;
	questions?: string[];
};

export type ResearchPackage = {
	status: 'empty' | 'draft' | 'approved' | 'changed_since_approval';
	version: number;
	updatedAt: string | null;
	notes: string;
	expertise: string;
	/** Research questions this package set out to answer. */
	questions?: string[];
	sources: ResearchPackageSource[];
	items: ResearchPackageItem[];
	gaps: string[];
	updates: ResearchUpdate[];
	approved: ResearchSnapshot | null;
};

export const SEARCH_INTENTS = [
	'informational',
	'commercial investigation',
	'transactional',
	'navigational',
	'mixed',
] as const;

export type ArticleBriefDetails = {
	secondaryKeywords: string;
	questions: string;
	avoid: string;
	tone: string;
	cta: string;
	requiredLinks: string;
	referenceMaterial: string;
	instructions: string;
	/** Strategy fields. Optional so briefs created before they existed stay valid. */
	clusterRole?: string;
	readerOutcome?: string;
	distinctiveContribution?: string;
	productConnection?: string;
	/** Existing articles this one must not duplicate, one per line (title or URL). */
	differentiateFrom?: string;
};

/** The requested length belongs to the user. Generation and review read it; only an explicit edit changes it. */
export type WordTarget = {
	requested: number;
	approved: number | null;
	tolerancePct: number;
};

export type SectionPlan = {
	heading: string;
	readerQuestion: string;
	contribution: string;
	practicalElement: string;
	targetWords: number;
	evidence: number[];
	links: string[];
};

export type BriefSuggestion = {
	field: keyof ArticleBriefDetails | 'audience' | 'primaryKeyword' | 'workingTitle' | 'targetWords';
	value: string;
	reason: string;
};

export type ArticleWorkspace = {
	destinationId: string | null;
	contentType: string;
	workingTitle: string;
	researchRequirements: string;
	internalLinking: string;
	imageRequirements: string;
	briefApprovedAt: string | null;
	briefChangedAfterApproval?: boolean;
	brief?: ArticleBriefDetails;
	briefSuggestions?: { createdAt: string; suggestions: BriefSuggestion[] } | null;
	externalId: string | null;
	researchId: string | null;
	research?: ResearchPackage;
	assignedModelRole: string;
	assignedModel: string | null;
	revision?: ArticleRevisionRef | null;
	generation: {
		jobId: string | null;
		model: string | null;
		promptTokens: number;
		completionTokens: number;
		estimatedCostUsd: number | null;
		status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
		error: string | null;
		stage?: string | null;
		startedAt?: string | null;
		updatedAt?: string | null;
		researchVersion?: number | null;
	};
	revisionJob?: JobState & { baseRevisionId: string | null; resultRevisionId: string | null };
	editorial: {
		status: 'not_run' | 'findings' | 'ready' | 'blocked';
		cyclesUsed: number;
		maxCycles: number;
		findings: ArticleEditorialFinding[];
		lastRunAt: string | null;
		exhausted: boolean;
		reviewedRevisionId?: string | null;
		reviewedRevisionNumber?: number | null;
		reviewedContentHash?: string | null;
		history?: ArticleReviewRun[];
	};
	categorySuggestion?: { categoryId: string; reason: string; source: 'mapping' | 'ai' | 'default'; tags: string[]; createdAt: string } | null;
	wordTarget?: WordTarget;
	sectionPlan?: SectionPlan[];
	/** Which taxonomy sync the category was chosen from, so a later rename or removal can be detected. */
	taxonomyRef?: { destinationId: string; syncedAt: string | null; categoryName: string | null } | null;
	media: {
		heroAssetId: string | null;
		ogAssetId: string | null;
		heroUrl: string | null;
		ogUrl: string | null;
		heroAlt: string;
		ogAlt: string;
		credit: string;
		license: string;
		deliveryVerified: boolean;
		deliveryError: string | null;
		/** Editable creative briefs and generation history per role. */
		creative?: import('./imageBrief').MediaCreativeState;
		/** Accepted asset ids that must not be overwritten silently. */
		acceptedHeroAssetId?: string | null;
		acceptedOgAssetId?: string | null;
	};
	cms: {
		externalId: string | null;
		revision: number | null;
		draftUrl: string | null;
		lastSyncAt: string | null;
		lastError: string | null;
		mode: DestinationDraftMode | null;
		submittedRevisionId?: string | null;
		remoteStatus?: string | null;
		heroMediaId?: string | null;
		heroSourceUrl?: string | null;
		ogMediaId?: string | null;
		ogSourceUrl?: string | null;
		/** Last submission attempt — success or failure — for operator feedback. */
		lastSubmission?: {
			at: string;
			ok: boolean;
			action: 'create' | 'update' | 'proposal' | 'correction';
			destinationId: string;
			destinationName?: string | null;
			externalId: string;
			httpMethod: 'PUT';
			statusCode?: number | null;
			cmsDocumentId?: string | null;
			cmsRevision?: number | null;
			cmsStatus?: string | null;
			adminUrl?: string | null;
			previewUrl?: string | null;
			error?: string | null;
		} | null;
	};
	editorialBrief?: import('./editorialBrief').EditorialBriefState;
	editorialDesk?: import('./editorialDesk').EditorialDeskState;
	intelligence?: {
		retrievedAt: string;
		brandId: string;
		strategyId: string | null;
		strategyStatus: string | null;
		capabilityIds: string[];
		claimIds: string[];
		learningIds: string[];
		verifiedNames: string[];
	};
	exampleConsistency?: string[];
	approvedAt?: string | null;
	approvedRevisionId?: string | null;
	seoEdited?: {
		seoTitle?: boolean;
		metaDescription?: boolean;
		excerpt?: boolean;
		slug?: boolean;
	};
	schedule: {
		publishAt: string | null;
		destinationId: string | null;
		approvalRequired: true;
		status: 'unscheduled' | 'scheduled' | 'blocked' | 'due';
		blockedReason: string | null;
	};
	researchSummary: {
		retrievedAt: string | null;
		competitors: Array<{ name: string; website?: string; claims: string[] }>;
		recommendedStructure: Array<{ id: string; heading: string; purpose: string }>;
		relatedArticleSlugs: string[];
		relatedTools: Array<{ slug: string; label: string }>;
		searchIntent: string;
	};
};

export type ArticleVersion = {
	body: string;
	createdAt: string;
	instruction?: string;
	revisionId?: string;
	number?: number;
	contentHash?: string;
	wordCount?: number;
	source?: ArticleRevisionRef['source'];
};

export type ArticleRecord = {
	id: string;
	ownerUserId: string;
	brandId: string;
	objective: string;
	audience?: string;
	topic: string;
	searchIntent: string;
	primaryKeyword?: string;
	secondaryTopics: string[];
	research: ArticleResearch;
	outline: Array<{ id: string; heading: string; purpose: string }>;
	sections: ArticleSection[];
	title: string;
	slug: string;
	excerpt: string;
	body: string;
	seo: ArticleSeo;
	author: string | null;
	categories: string[];
	tags: string[];
	featuredAssetId?: string;
	inlineAssetIds: string[];
	mediaPlan: unknown;
	internalLinkOpportunities: string[];
	status: 'brief' | 'draft' | 'review' | 'approved' | 'published';
	approval: { required: true; approver: 'human'; status: 'pending' | 'approved' | 'rejected' };
	publishDestination?: string;
	publishAt?: string;
	publication: ArticlePublication | null;
	performanceContentId: string;
	wordCount: number;
	targetWords: number;
	review: { materialPassed: boolean; note: string; coherenceFindings?: string[] } | null;
	versions: ArticleVersion[];
	distribution: {
		disclosure: string | null;
		sponsorship: 'none' | 'sponsored' | 'partner' | 'affiliate';
		contentCluster: string | null;
		authorProfileId: string | null;
	};
	createdAt: string;
	updatedAt: string;
	workspace?: ArticleWorkspace;
};
