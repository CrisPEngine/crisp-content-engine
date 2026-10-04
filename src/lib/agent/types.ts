import type { AgentCapability, RateLimitPolicy } from './policy';

export type AgentEnvironment = 'production' | 'staging' | 'test';

export type AgentCredential = {
	id: string;
	name: string;
	ownerUserId: string;
	organisationId?: string;
	allowedBrandIds: string[];
	capabilities: AgentCapability[];
	environment: AgentEnvironment;
	keyHash: string;
	keyPrefix: string;
	rateLimit: RateLimitPolicy;
	createdAt: string;
	lastUsedAt?: string;
	expiresAt?: string;
	revokedAt?: string;
};

export type PublicAgentCredential = Omit<AgentCredential, 'keyHash'>;

export type MarketingOpportunity = {
	id: string;
	brandId: string;
	source: string;
	sourcePlatform?: string;
	sourceUrl?: string;
	sourceId?: string;
	discoveredBy: string;
	discoveredAt: string;
	opportunityType: string;
	topic: string;
	summary: string;
	whyRelevant?: string;
	audience?: string;
	suggestedAction?: string;
	suggestedChannel?: string;
	urgency?: string;
	confidence?: string;
	evidence: Array<{ url?: string; excerpt?: string; author?: string; retrievedAt?: string; platformId?: string }>;
	relatedThemeId?: string;
	relatedStrategyId?: string;
	status: 'new' | 'evaluated' | 'accepted' | 'dismissed' | 'expired';
	expiresAt?: string;
	evaluation?: Record<string, unknown>;
	summaryByDiscoverer?: string;
};

export type AgentBriefRecord = {
	id: string;
	brandId: string;
	objective: string;
	audience?: string;
	channel: string;
	channels: string[];
	instruction?: string;
	opportunityId?: string;
	themeId?: string;
	assetIds: string[];
	researchIds: string[];
	status: 'open' | 'generated';
	createdAt: string;
	contentIds: string[];
};

export type ResearchRecord = {
	id: string;
	brandId: string;
	request: string;
	sources: Array<{ url?: string; title?: string; retrievedAt?: string; excerpt?: string }>;
	claims: Array<{ text: string; confidence?: string; sourceUrl?: string }>;
	createdAt: string;
	briefId?: string;
	note: string;
};

export type CommunityInteraction = {
	id: string;
	brandId: string;
	platform: string;
	externalPostId?: string;
	externalInteractionId?: string;
	type: string;
	authorLabel?: string;
	text?: string;
	occurredAt?: string;
	sentiment?: string;
	opportunityRelevance?: string;
	responseStatus: 'open' | 'drafted' | 'awaiting_approval' | 'published' | 'ignored' | 'resolved';
	contentId?: string;
	draftReply?: string;
	createdAt: string;
};

export type AdChangeProposal = {
	id: string;
	brandId: string;
	platform: string;
	account?: string;
	campaign?: string;
	currentState?: string;
	proposedState: string;
	reason: string;
	evidence?: string;
	expectedEffect?: string;
	confidence: string;
	financialDelta?: string;
	dailyBudgetDelta?: string;
	totalBudgetDelta?: string;
	createdBy: string;
	createdAt: string;
	approvalStatus: 'pending' | 'approved' | 'rejected' | 'expired';
	expiresAt: string;
};

export type AgentEvent = {
	id: string;
	brandId?: string;
	type: string;
	payload: Record<string, unknown>;
	createdAt: string;
};

export type AgentFeedback = {
	id: string;
	brandId: string;
	subjectType: string;
	subjectId?: string;
	note: string;
	actor: string;
	createdAt: string;
	appliedToBrandBrain: false;
};

export type ContentAsset = {
	id: string;
	brandId: string;
	kind: 'image' | 'video' | 'audio' | 'document' | 'link_preview' | 'carousel';
	source?: string;
	ownership?: string;
	altText?: string;
	width?: number;
	height?: number;
	mime?: string;
	externalMediaId?: string;
	channels: string[];
	createdAt: string;
};

export type AuditEntry = {
	id: string;
	credentialId: string;
	ownerUserId: string;
	brandId?: string;
	action: string;
	capability?: string;
	consequenceLevel?: number;
	requestId: string;
	idempotencyKey?: string;
	requestSummary: Record<string, unknown>;
	affectedObject?: string;
	resultStatus: string;
	approvalRequired: boolean;
	approvalId?: string;
	latencyMs: number;
	errorCode?: string;
	externalIds?: Record<string, unknown>;
	createdAt: string;
};

export type IdempotencyRecord = {
	credentialId: string;
	idempotencyKey: string;
	requestHash: string;
	response: unknown;
	createdAt: string;
};

export type AgentControlStore = {
	insertCredential(credential: AgentCredential): Promise<void>;
	updateCredential(id: string, patch: Partial<Pick<AgentCredential, 'lastUsedAt' | 'revokedAt' | 'capabilities' | 'allowedBrandIds'>>): Promise<void>;
	findCredentialByHash(keyHash: string): Promise<AgentCredential | null>;
	listCredentials(ownerUserId: string): Promise<AgentCredential[]>;
	getCredential(ownerUserId: string, id: string): Promise<AgentCredential | null>;

	readIdempotency(credentialId: string, key: string): Promise<IdempotencyRecord | null>;
	writeIdempotency(record: IdempotencyRecord): Promise<void>;

	consumeRate(credentialId: string, windowKey: string, limit: number, windowMs: number): Promise<{ allowed: boolean; count: number }>;
	addCost(credentialId: string, usd: number): Promise<number>;
	costToday(credentialId: string): Promise<number>;
	addImageCost(credentialId: string, usd: number): Promise<number>;
	imageCostToday(credentialId: string): Promise<number>;

	writeAudit(entry: AuditEntry): Promise<void>;
	listAudit(ownerUserId: string, credentialId?: string): Promise<AuditEntry[]>;

	saveOpportunity(ownerUserId: string, opportunity: MarketingOpportunity): Promise<MarketingOpportunity>;
	listOpportunities(ownerUserId: string, brandId: string): Promise<MarketingOpportunity[]>;
	getOpportunity(ownerUserId: string, id: string): Promise<MarketingOpportunity | null>;

	saveBrief(ownerUserId: string, brief: AgentBriefRecord): Promise<AgentBriefRecord>;
	getBrief(ownerUserId: string, id: string): Promise<AgentBriefRecord | null>;

	saveResearch(ownerUserId: string, record: ResearchRecord): Promise<ResearchRecord>;
	getResearch(ownerUserId: string, id: string): Promise<ResearchRecord | null>;

	saveInteraction(ownerUserId: string, interaction: CommunityInteraction): Promise<CommunityInteraction>;
	listInteractions(ownerUserId: string, brandId: string): Promise<CommunityInteraction[]>;
	getInteraction(ownerUserId: string, id: string): Promise<CommunityInteraction | null>;

	saveAdProposal(ownerUserId: string, proposal: AdChangeProposal): Promise<AdChangeProposal>;
	listAdProposals(ownerUserId: string, brandId: string): Promise<AdChangeProposal[]>;

	saveEvent(ownerUserId: string, event: AgentEvent): Promise<AgentEvent>;
	listEvents(ownerUserId: string, brandId?: string): Promise<AgentEvent[]>;

	saveFeedback(ownerUserId: string, feedback: AgentFeedback): Promise<AgentFeedback>;
	saveAsset(ownerUserId: string, asset: ContentAsset): Promise<ContentAsset>;
	getAsset(ownerUserId: string, id: string): Promise<ContentAsset | null>;
};
