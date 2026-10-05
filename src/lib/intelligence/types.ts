export type Channel =
	| 'linkedin'
	| 'x'
	| 'blog'
	| 'newsletter'
	| 'instagram'
	| 'facebook'
	| 'other';

export type ContentType =
	| 'founder_post'
	| 'company_post'
	| 'thread'
	| 'article'
	| 'newsletter'
	| 'short_post'
	| 'follow_up'
	| 'other';

export type FunnelStage = 'awareness' | 'consideration' | 'decision' | 'retention' | 'advocacy';

export type OptimizationObjective =
	| 'awareness'
	| 'authority'
	| 'engagement'
	| 'website_traffic'
	| 'lead_generation'
	| 'conversion'
	| 'community'
	| 'retention'
	| 'launch_awareness'
	| 'education';

export type PublicationStatus =
	| 'idea'
	| 'draft'
	| 'review'
	| 'approved'
	| 'scheduled'
	| 'published'
	| 'failed'
	| 'archived';

export type ConfidenceLevel = 'insufficient' | 'low' | 'moderate' | 'high';

export type EditLearningConfidence = 'candidate' | 'observed' | 'strong' | 'confirmed';

export type EditLearningStatus = 'proposed' | 'accepted' | 'edited' | 'rejected' | 'disabled';

export type LearningValidity = 'active' | 'decaying' | 'retest_candidate' | 'invalidated' | 'disabled';

export type ExampleKind = 'good' | 'poor' | 'representative' | 'user_edited';

export type WorkflowJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying' | 'cancelled';

export type WorkflowJobType =
	| 'generation'
	| 'research'
	| 'review'
	| 'publishing'
	| 'analytics_sync'
	| 'notification'
	| 'theme_plan'
	| 'brief';

export type BrandIdentity = {
	name: string;
	description?: string;
	purpose?: string;
	mission?: string;
	positioning?: string;
	productsServices?: string[];
	differentiators?: string[];
	audiences?: string[];
	competitors?: string[];
	marketCategory?: string;
};

export type BrandVoice = {
	tone?: string;
	personality?: string;
	formality?: string;
	sentenceStyle?: string;
	vocabularyPreferences?: string;
	humour?: string;
	pointOfView?: string;
	pacing?: string;
	formattingPreferences?: string;
};

export const TERM_ENFORCEMENT_LEVELS = [
	'REQUIRED',
	'STRONGLY_PREFERRED',
	'PREFERRED',
	'AVOID',
	'PROHIBITED',
] as const;

export type TermEnforcementLevel = (typeof TERM_ENFORCEMENT_LEVELS)[number];

export type BrandTermRule = {
	term: string;
	level: TermEnforcementLevel;
	reason?: string;
};

export type BrandGuardrails = {
	phrasesToAvoid?: string[];
	prohibitedClaims?: string[];
	requiredTerminology?: string[];
	termRules?: BrandTermRule[];
	styleRestrictions?: string[];
	regulatoryConsiderations?: string[];
	unwantedAiBehaviours?: string[];
	ctaRestrictions?: string[];
	promotionalIntensity?: string;
	/** Absent or true means native generation is available. False disables this brand only. */
	nativeIntelligenceEnabled?: boolean;
};

export type BrandFaq = { question: string; answer: string };

export type BrandKnowledge = {
	brandFacts?: string[];
	productFacts?: string[];
	founderFacts?: string[];
	faqs?: BrandFaq[];
	differentiators?: string[];
	proofPoints?: string[];
	referenceInformation?: string[];
};

export type BrandBrainExample = {
	id: string;
	kind: ExampleKind;
	channel?: Channel | string;
	contentType?: ContentType | string;
	body: string;
	whyItWorks?: string;
	metadata?: Record<string, unknown>;
};

export type BrandBrain = {
	id: string;
	userId: string;
	airtableBrandId: string;
	identity: BrandIdentity;
	voice: BrandVoice;
	guardrails: BrandGuardrails;
	knowledge: BrandKnowledge;
	examples: BrandBrainExample[];
	updatedAt: string;
};

export type StrategyAudience = {
	name: string;
	description?: string;
	problems?: string[];
	desiredOutcomes?: string[];
};

export type BrandStrategy = {
	id: string;
	userId: string;
	brandBrainId: string;
	airtableBrandId: string;
	status: string;
	objectives: string[];
	audiences: StrategyAudience[];
	audienceProblems: string[];
	desiredOutcomes: string[];
	positioning?: string;
	keyMessages: string[];
	proofPoints: string[];
	contentPillars: string[];
	funnelStages: FunnelStage[];
	ctaStrategy: Record<string, unknown>;
	contentMix: Record<string, unknown>;
	editorialThemes: string[];
	campaigns: BrandCampaign[];
	channelStrategies: ChannelStrategy[];
};

export type BrandCampaign = {
	id: string;
	strategyId: string;
	title: string;
	objective?: string;
	description?: string;
	startDate?: string;
	endDate?: string;
	status: string;
};

export type ChannelStrategy = {
	id: string;
	strategyId: string;
	channel: Channel | string;
	role?: string;
	cadence?: string;
	formats: string[];
	ctaNotes?: string;
	constraints: string[];
};

export type ContentTheme = {
	id: string;
	userId: string;
	brandBrainId: string;
	strategyId?: string;
	title: string;
	description?: string;
	objective?: string;
	targetAudience?: string;
	relatedPillars: string[];
	keyArguments: string[];
	subtopics: string[];
	questionsToAnswer: string[];
	proofPoints: string[];
	keywords: string[];
	channels: Array<Channel | string>;
	desiredFrequency?: string;
	startDate?: string;
	endDate?: string;
	status: string;
};

export type ThemePlanPiece = {
	id: string;
	channel: Channel | string;
	contentType: ContentType | string;
	title: string;
	angle: string;
	hookDirection: string;
	howItAdapts: string;
	relationshipToCoreIdea: string;
};

export type ThemePlan = {
	id: string;
	themeId: string;
	coreIdea: string;
	horizonWeeks: number;
	pieces: ThemePlanPiece[];
	rationale?: string;
};

export type ContentMemoryRecord = {
	id: string;
	userId: string;
	brandBrainId: string;
	airtableContentId?: string;
	themeId?: string;
	campaignId?: string;
	strategyId?: string;
	briefId?: string;
	parentMemoryId?: string;
	experimentId?: string;
	channel: Channel | string;
	contentType?: ContentType | string;
	contentPillar?: string;
	topic?: string;
	angle?: string;
	hook?: string;
	argument?: string;
	cta?: string;
	format?: string;
	body?: string;
	publicationStatus: PublicationStatus | string;
	publicationDate?: string;
	destination?: string;
	sourceIdea?: string;
	externalPostId?: string;
	externalUrl?: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
};

export type ContentBrief = {
	objective: string;
	audience: string;
	channel: Channel | string;
	contentType: ContentType | string;
	funnelStage: FunnelStage | string;
	theme?: string;
	contentPillar?: string;
	campaign?: string;
	topic: string;
	angle: string;
	hookDirection: string;
	centralArgument: string;
	supportingPoints: string[];
	evidence: string[];
	proofPoints: string[];
	relevantBrandContext: string[];
	voiceRequirements: string[];
	cta: string;
	guardrails: string[];
	prohibitedPhrases: string[];
	relatedPreviousContent: Array<{ id: string; reason: string; hook?: string }>;
	differentiationFromRecent: string[];
	sourceRequirements: string[];
	optimizationObjective: OptimizationObjective;
	contentOpportunity?: string;
	whyNow?: string;
	repetitionRisk?: string;
	experimentOpportunity?: string;
};

export type StoredBrief = {
	id: string;
	userId: string;
	brandBrainId: string;
	userIntent: string;
	payload: ContentBrief;
	themeId?: string;
	strategyId?: string;
	campaignId?: string;
	memoryId?: string;
};

export type ProsePatternHit = {
	id: string;
	label: string;
	severity: 'low' | 'medium' | 'high';
	count: number;
	examples: string[];
};

export type ReviewFinding = {
	code: string;
	message: string;
	level: TermEnforcementLevel | 'editorial';
	forcesRevision: boolean;
};

export type ReviewResult = {
	brandFit: {
		score: number;
		issues: string[];
		passed: boolean;
	};
	prose: {
		score: number;
		hits: ProsePatternHit[];
		notes: string[];
	};
	originalDraft: string;
	improvedDraft: string;
	changed: boolean;
	findings: ReviewFinding[];
	revisionReason: string | null;
	materialPassed: boolean;
};

export type ContentScorecard = {
	brandFit: number;
	objectiveFit: number;
	originality: number;
	themeRelevance: number;
	hookStrength: number;
	clarity: number;
	evidence: number;
	ctaAlignment: number;
	humanProse: number;
	predictedAudienceRelevance: number | null;
	predictionNote: string;
};

export type PerformanceSnapshot = {
	id: string;
	memoryId?: string;
	channel: Channel | string;
	collectedAt: string;
	hoursSincePublish?: number;
	impressions?: number;
	reach?: number;
	clicks?: number;
	reactions?: number;
	comments?: number;
	shares?: number;
	saves?: number;
	conversions?: number;
	followerGrowth?: number;
	dwellSeconds?: number;
	engagementRate?: number;
	clickThroughRate?: number;
	normalised: Record<string, number>;
};

export type ContentLearning = {
	id: string;
	brandBrainId: string;
	scope: string;
	channel?: string;
	observation: string;
	metric?: string;
	objective?: OptimizationObjective | string;
	supportingMemoryIds: string[];
	supportingExperimentIds: string[];
	confidence: ConfidenceLevel;
	validityStatus: LearningValidity;
	createdAt: string;
	lastValidatedAt?: string;
	expiresAt?: string;
};

export type Experiment = {
	id: string;
	brandBrainId: string;
	title: string;
	hypothesis: string;
	variable: string;
	primaryMetric: string;
	secondaryMetrics: string[];
	objective: OptimizationObjective | string;
	status: string;
	minimumSample: number;
	measurementWindowHours: number;
	winnerVariantId?: string;
	confidence: ConfidenceLevel;
	notes?: string;
	variants: ExperimentVariant[];
};

export type ExperimentVariant = {
	id: string;
	experimentId: string;
	role: 'control' | 'variant';
	label: string;
	memoryId?: string;
	description?: string;
	controls: Record<string, string>;
};

export type ExperimentAnalysis = {
	experimentId: string;
	ready: boolean;
	winnerVariantId?: string;
	confidence: ConfidenceLevel;
	reason: string;
	metricComparisons: Array<{
		metric: string;
		control?: number;
		variant?: number;
		relativeLift?: number;
	}>;
	learning?: string;
};

export type UserEditLearning = {
	id: string;
	brandBrainId: string;
	signalType: string;
	observation: string;
	confidence: EditLearningConfidence;
	status: EditLearningStatus;
	occurrenceCount: number;
};

export type WorkflowJob = {
	id: string;
	userId: string;
	brandBrainId?: string;
	jobType: WorkflowJobType | string;
	status: WorkflowJobStatus;
	payload: Record<string, unknown>;
	referenceId?: string;
	retryCount: number;
	maxRetries: number;
	lastError?: string;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
};

export type GenerationIntent = {
	userId: string;
	airtableBrandId: string;
	userIntent: string;
	channel: Channel | string;
	contentType?: ContentType | string;
	themeId?: string;
	campaignId?: string;
	optimizationObjective?: OptimizationObjective;
	allowThemeContinuation?: boolean;
};

export type GenerationResult = {
	brief: StoredBrief;
	draftId: string;
	aiDraft: string;
	reviewedDraft: string;
	review: ReviewResult;
	score: ContentScorecard;
	memory: ContentMemoryRecord;
	modelRole: 'WRITING';
	requestIds: string[];
	usage: IntelligenceUsage[];
	estimatedCostUsd: number | null;
	contextGaps: string[];
	memoriesConsidered: Array<{ id: string; hook?: string; topic?: string; reason: string }>;
};

export type IntelligenceUsage = {
	role: string;
	feature: string;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	estimatedCostUsd?: number | null;
};
