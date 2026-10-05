export const RESEARCH_PROJECT_TYPES = [
	'BRAND_DISCOVERY',
	'WEBSITE_DISCOVERY',
	'COMPETITOR_RESEARCH',
	'REVIEW_RESEARCH',
	'AUDIENCE_RESEARCH',
	'MARKET_RESEARCH',
	'TREND_RESEARCH',
	'CONTENT_RESEARCH',
	'ARTICLE_RESEARCH',
	'CLAIM_VERIFICATION',
	'NEWS_MONITORING',
	'COMPETITOR_MONITORING',
	'REPUTATION_MONITORING',
	'CURRENT_RESEARCH',
] as const;

export type ResearchProjectType = (typeof RESEARCH_PROJECT_TYPES)[number];

export const KNOWLEDGE_CLASSES = [
	'FIRST_PARTY_VERIFIED',
	'FIRST_PARTY_CLAIM',
	'THIRD_PARTY_FACT',
	'THIRD_PARTY_CLAIM',
	'CUSTOMER_REVIEW',
	'PUBLIC_OPINION',
	'MARKET_DATA',
	'NEWS',
	'COMPETITOR_CLAIM',
	'INFERENCE',
	'CCE_HYPOTHESIS',
	'USER_CONFIRMED_FACT',
] as const;

export type KnowledgeClass = (typeof KNOWLEDGE_CLASSES)[number];

export const SOURCE_CLASSES = [
	'OFFICIAL_PRIMARY',
	'GOVERNMENT_REGULATOR',
	'FIRST_PARTY',
	'ACADEMIC',
	'MAJOR_NEWS',
	'INDUSTRY_PUBLICATION',
	'KNOWN_DATA_PROVIDER',
	'REVIEW_PLATFORM',
	'COMMUNITY',
	'SOCIAL',
	'BLOG',
	'UNKNOWN',
] as const;

export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const FINDING_STATES = ['OBSERVED', 'SUPPORTED', 'STRONGLY_SUPPORTED', 'USER_CONFIRMED', 'REJECTED', 'STALE'] as const;

export type FindingState = (typeof FINDING_STATES)[number];

export const RESEARCH_DECISIONS = [
	'NO_RESEARCH_NEEDED',
	'USE_EXISTING_RESEARCH',
	'REFRESH_EXISTING_RESEARCH',
	'QUICK_VERIFY',
	'FULL_RESEARCH',
] as const;

export type ResearchDecision = (typeof RESEARCH_DECISIONS)[number];

export const TREND_STATES = ['TREND_SIGNAL', 'EMERGING', 'ESTABLISHED', 'DECLINING', 'INSUFFICIENT_EVIDENCE'] as const;

export type TrendState = (typeof TREND_STATES)[number];

export const COMPETITOR_RELATIONS = ['DIRECT', 'INDIRECT', 'ALTERNATIVE', 'STATUS_QUO', 'UNCLASSIFIED'] as const;

export type CompetitorRelation = (typeof COMPETITOR_RELATIONS)[number];

export const MONITOR_TYPES = [
	'BRAND_MENTIONS',
	'COMPETITOR_CHANGES',
	'CATEGORY_NEWS',
	'TREND_DISCOVERY',
	'REVIEW_CHANGES',
	'WEBSITE_CHANGES',
	'PRODUCT_CHANGES',
	'PRICING_CHANGES',
	'STRATEGIC_TOPIC',
	'REGULATORY_TOPIC',
] as const;

export type MonitorType = (typeof MONITOR_TYPES)[number];

export type ResearchSource = {
	id: string;
	url: string;
	domain: string;
	title?: string;
	publisher?: string;
	author?: string;
	publishedAt?: string;
	retrievedAt: string;
	verifiedAt?: string;
	sourceClass: SourceClass;
	pageType?: string;
	excerpt?: string;
	summary?: string;
	fingerprint?: string;
	rejected?: boolean;
	rejectReason?: string;
};

export type ResearchClaim = {
	id: string;
	text: string;
	knowledgeClass: KnowledgeClass;
	confidence: 'insufficient' | 'low' | 'moderate' | 'high';
	sourceIds: string[];
	state: FindingState;
	freshUntil?: string;
	staleness: 'fresh' | 'aging' | 'stale' | 'unknown';
};

export type ResearchFinding = {
	id: string;
	text: string;
	knowledgeClass: KnowledgeClass;
	state: FindingState;
	sourceIds: string[];
	topic?: string;
	sentiment?: 'positive' | 'negative' | 'mixed' | 'neutral';
};

export type ResearchContradiction = {
	id: string;
	topic: string;
	evidenceA: string;
	evidenceB: string;
	sourceIds: string[];
	likelyResolution: string;
	confirmationNeeded: boolean;
};

export type BrandBrainProposal = {
	id: string;
	field: 'brandFacts' | 'productFacts' | 'positioning' | 'competitors' | 'audiences' | 'themes';
	text: string;
	state: FindingState;
	knowledgeClass: KnowledgeClass;
	sourceIds: string[];
	requiresConfirmation: boolean;
};

export type CompetitorRecord = {
	name: string;
	website?: string;
	relation: CompetitorRelation;
	claims: string[];
	sourceIds: string[];
	lastResearchedAt: string;
};

export type ReviewSignal = {
	sourceId: string;
	rating?: number;
	excerpt: string;
	sentiment: 'positive' | 'negative' | 'mixed' | 'neutral';
	topics: string[];
};

export type TrendAssessment = {
	state: TrendState;
	confidence: 'insufficient' | 'low' | 'moderate' | 'high';
	sourceCount: number;
	domainCount: number;
	reason: string;
};

export type ResearchUsage = {
	searches: number;
	pagesFetched: number;
	estimatedSearchUsd: number;
	durationMs: number;
	provider: string;
};

export type ResearchPacket = {
	projectType: ResearchProjectType;
	decision: ResearchDecision;
	query: string;
	sources: ResearchSource[];
	claims: ResearchClaim[];
	findings: ResearchFinding[];
	entities: string[];
	topics: string[];
	contradictions: ResearchContradiction[];
	proposals: BrandBrainProposal[];
	competitors: CompetitorRecord[];
	reviews: ReviewSignal[];
	reviewSummary?: string;
	trend?: TrendAssessment;
	gaps: string[];
	usage: ResearchUsage;
	promotedToBrandBrain: false;
};
