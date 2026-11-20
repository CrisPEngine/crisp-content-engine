export type DemandClass = 'observed' | 'inferred' | 'strategic' | 'unvalidated';
export type EvidenceConfidence = 'high' | 'medium' | 'low' | 'none';
export type OpportunityAction = 'create' | 'update' | 'reject' | 'research';
export type OpportunityStatus = 'discovered' | 'needs_research' | 'approved' | 'rejected' | 'deferred' | 'in_production' | 'archived';
export type ApprovalMode = 'assisted' | 'auto_draft' | 'auto_publish';
export type CampaignStatus = 'draft' | 'active' | 'paused';

export type ScoreWeights = {
	audienceDemand: number;
	brandRelevance: number;
	uniqueValue: number;
	searchOpportunity: number;
	businessRelevance: number;
	researchFeasibility: number;
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
	audienceDemand: 0.25,
	brandRelevance: 0.2,
	uniqueValue: 0.2,
	searchOpportunity: 0.15,
	businessRelevance: 0.1,
	researchFeasibility: 0.1,
};

export type MeasuredSearch = {
	impressions: number;
	clicks: number;
	ctr: number;
	position: number;
	startDate: string;
	endDate: string;
	/** Query totals are exact-query demand. Page totals are not. */
	scope?: 'query' | 'page';
};

export type ScoreThresholds = {
	highConfidenceImpressions: number;
	meaningfulImpressions: number;
	recordImpressions: number;
	lowCtr: number;
	leadingPosition: number;
	pageDemandFactor: number;
};

export const DEFAULT_SCORE_THRESHOLDS: ScoreThresholds = {
	highConfidenceImpressions: 50,
	meaningfulImpressions: 20,
	recordImpressions: 5,
	lowCtr: 0.03,
	leadingPosition: 10,
	pageDemandFactor: 0.6,
};

export type OptimisationScope = 'metadata' | 'section' | 'expansion' | 'none';

export type ScoreComponent = {
	key: keyof ScoreWeights;
	weight: number;
	value: number;
	contribution: number;
	rationale: string;
};

export type ScoreResult = {
	score: number;
	confidence: EvidenceConfidence;
	components: ScoreComponent[];
	promotionBlocked: boolean;
	blockReason: string | null;
	lane?: 'existing_query' | 'new_topic' | 'refresh';
	laneRationale?: string;
	selectionRationale?: string;
	rescore?: {
		at: string;
		previousConfidence: EvidenceConfidence;
		confidence: EvidenceConfidence;
		reason: string;
		metricsUnchanged: true;
		scope: 'query' | 'page' | null;
	};
};

export type InventoryArticle = {
	id: string;
	title: string;
	topic: string;
	keyword: string | null;
	intent: string | null;
	status: string;
	url: string | null;
};

export type OverlapAssessment = {
	decision: OpportunityAction;
	overlap: number;
	matchedArticleId: string | null;
	matchedTitle: string | null;
	rationale: string;
};

export type OpportunityEvidence = {
	id: string;
	sourceKind: string;
	url: string | null;
	excerpt: string | null;
	observedAt: string | null;
	metrics: MeasuredSearch | null;
};

export type ContentOpportunity = {
	id: string;
	brandId: string;
	campaignId: string | null;
	title: string;
	audienceProblem: string;
	searchIntent: string | null;
	demandClass: DemandClass;
	evidenceConfidence: EvidenceConfidence;
	score: number;
	scoreDetail: ScoreResult;
	overlap: OverlapAssessment;
	recommendedAction: OpportunityAction;
	status: OpportunityStatus;
	discoverySource: string;
	evidence: OpportunityEvidence[];
	createdAt: string;
	updatedAt: string;
};

export type ContentCampaign = {
	id: string;
	brandId: string;
	name: string;
	objective: string;
	audience: string;
	themes: string[];
	weeklyCapacity: number;
	selectionPolicy: string;
	approvalMode: ApprovalMode;
	autoPublishEnabled: false;
	destinationId: string | null;
	status: CampaignStatus;
	/** Persisted in content_campaigns.quality_policy. Publishing stays off unless this policy says otherwise. */
	operation?: import('@/lib/operations/policy').BrandOperationPolicy;
	createdAt: string;
	updatedAt: string;
};

export type ProviderAvailability = {
	id: 'inventory' | 'strategy' | 'search' | 'search_console' | 'community' | 'analytics';
	label: string;
	state: 'available' | 'unavailable' | 'connected' | 'error';
	detail: string;
	property?: string | null;
	lastSuccessAt?: string | null;
	error?: string | null;
};

export type ProductionStage = 'research' | 'brief' | 'draft' | 'editorial' | 'corrections' | 'seo' | 'hero' | 'quality' | 'approval';
export type ProductionJobStatus = 'queued' | 'running' | 'needs_attention' | 'ready_for_approval' | 'failed' | 'paused' | 'completed';

export type ProductionStageLog = { stage: ProductionStage; at: string; note: string };

export type ProductionJob = {
	id: string;
	brandId: string;
	campaignId: string | null;
	opportunityId: string;
	articleId: string | null;
	stage: ProductionStage;
	status: ProductionJobStatus;
	attempt: number;
	note: string;
	error: string | null;
	costUsd: number;
	stageLog: ProductionStageLog[];
	createdAt: string;
	updatedAt: string;
};

export type AnalyticsBinding = {
	brandId: string;
	searchConsoleSiteUrl: string | null;
	ga4PropertyId: string | null;
	searchConsoleLastSuccessAt: string | null;
	searchConsoleLastError: string | null;
	ga4LastSuccessAt: string | null;
	ga4LastError: string | null;
};
