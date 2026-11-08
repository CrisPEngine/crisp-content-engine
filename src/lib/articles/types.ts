export type ArticleSection = {
	id: string;
	heading: string;
	purpose: string;
	body: string;
	claims: string[];
};

export type ArticleResearch = {
	sources: Array<{ label: string; kind: 'brand_brain' | 'supplied' | 'opportunity'; url?: string; retrievedAt?: string }>;
	claims: Array<{ text: string; sourceLabel: string; confidence: 'stored' | 'supplied' }>;
	gaps: string[];
	usedExternalResearch?: boolean;
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

export type ArticleEditorialFinding = {
	id: string;
	severity: 'critical' | 'major' | 'minor';
	code: string;
	dimension: EditorialDimension;
	instruction: string;
	source: 'deterministic' | 'llm';
	decision: 'pending' | 'accepted' | 'rejected';
};

export type ArticleWorkspace = {
	destinationId: string | null;
	contentType: string;
	workingTitle: string;
	researchRequirements: string;
	internalLinking: string;
	imageRequirements: string;
	briefApprovedAt: string | null;
	externalId: string | null;
	researchId: string | null;
	assignedModelRole: string;
	assignedModel: string | null;
	generation: {
		jobId: string | null;
		model: string | null;
		promptTokens: number;
		completionTokens: number;
		estimatedCostUsd: number | null;
		status: 'idle' | 'queued' | 'processing' | 'completed' | 'failed';
		error: string | null;
	};
	editorial: {
		status: 'not_run' | 'findings' | 'ready' | 'blocked';
		cyclesUsed: number;
		maxCycles: number;
		findings: ArticleEditorialFinding[];
		lastRunAt: string | null;
		exhausted: boolean;
	};
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
	};
	cms: {
		externalId: string | null;
		revision: number | null;
		draftUrl: string | null;
		lastSyncAt: string | null;
		lastError: string | null;
		mode: 'update' | 'proposal' | null;
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
	versions: Array<{ body: string; createdAt: string; instruction?: string }>;
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
