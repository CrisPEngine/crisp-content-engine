import { getSupabaseService } from '@/lib/supabaseService';
import { normaliseOperationPolicy } from '@/lib/operations/policy';
import type { BrandOperationPolicy } from '@/lib/operations/policy';
import type { AnalyticsBinding, ApprovalMode, CampaignStatus, ContentCampaign, ContentOpportunity, DemandClass, EvidenceConfidence, OpportunityAction, OpportunityEvidence, OpportunityStatus, ProductionJob, ScoreResult, OverlapAssessment } from './types';

export type NewOpportunity = Omit<ContentOpportunity, 'id' | 'createdAt' | 'updatedAt'> & { naturalKey: string };
export type NewCampaign = Omit<ContentCampaign, 'id' | 'createdAt' | 'updatedAt' | 'autoPublishEnabled'>;

export type OpportunityRepository = {
	list(userId: string, brandId: string): Promise<ContentOpportunity[]>;
	get(userId: string, id: string): Promise<ContentOpportunity | null>;
	findByKey(userId: string, brandId: string, naturalKey: string): Promise<ContentOpportunity | null>;
	save(userId: string, opportunity: NewOpportunity): Promise<ContentOpportunity>;
	setStatus(userId: string, id: string, status: OpportunityStatus): Promise<ContentOpportunity>;
	appendEvidence(userId: string, id: string, evidence: OpportunityEvidence[]): Promise<ContentOpportunity>;
	applyRescore(userId: string, id: string, patch: { evidenceConfidence: EvidenceConfidence; scoreDetail: ScoreResult }): Promise<ContentOpportunity>;
	updateAssessment(userId: string, id: string, patch: { overlap: OverlapAssessment; recommendedAction: OpportunityAction; status: OpportunityStatus; scoreDetail: ScoreResult }): Promise<ContentOpportunity>;
	listCampaigns(userId: string, brandId: string): Promise<ContentCampaign[]>;
	saveCampaign(userId: string, campaign: NewCampaign): Promise<ContentCampaign>;
	updateCampaign(userId: string, id: string, patch: { status?: CampaignStatus; weeklyCapacity?: number; approvalMode?: ApprovalMode; themes?: string[]; operation?: BrandOperationPolicy }): Promise<ContentCampaign>;
	getBinding(userId: string, brandId: string): Promise<AnalyticsBinding | null>;
	recordAnalyticsCheck(userId: string, brandId: string, patch: Partial<AnalyticsBinding>): Promise<AnalyticsBinding>;
	listJobs(userId: string, brandId: string): Promise<ProductionJob[]>;
	getJob(userId: string, id: string): Promise<ProductionJob | null>;
	getJobByOpportunity(userId: string, opportunityId: string): Promise<ProductionJob | null>;
	getJobByArticle(userId: string, articleId: string): Promise<ProductionJob | null>;
	saveJob(userId: string, job: ProductionJob): Promise<ProductionJob>;
};

type OpportunityRow = {
	id: string;
	brand_id: string;
	campaign_id: string | null;
	title: string;
	audience_problem: string;
	search_intent: string | null;
	demand_class: DemandClass;
	evidence_confidence: EvidenceConfidence;
	score: number;
	score_detail: ScoreResult;
	overlap: OverlapAssessment;
	recommended_action: OpportunityAction;
	status: OpportunityStatus;
	discovery_source: string;
	natural_key: string;
	created_at: string;
	updated_at: string;
	content_opportunity_evidence?: EvidenceRow[];
};

type EvidenceRow = {
	id: string;
	source_kind: string;
	url: string | null;
	excerpt: string | null;
	observed_at: string | null;
	metrics: OpportunityEvidence['metrics'];
};

function fromRow(row: OpportunityRow): ContentOpportunity {
	return {
		id: row.id,
		brandId: row.brand_id,
		campaignId: row.campaign_id,
		title: row.title,
		audienceProblem: row.audience_problem,
		searchIntent: row.search_intent,
		demandClass: row.demand_class,
		evidenceConfidence: row.evidence_confidence,
		score: Number(row.score),
		scoreDetail: row.score_detail,
		overlap: row.overlap,
		recommendedAction: row.recommended_action,
		status: row.status,
		discoverySource: row.discovery_source,
		evidence: (row.content_opportunity_evidence ?? []).map((item) => ({
			id: item.id,
			sourceKind: item.source_kind,
			url: item.url,
			excerpt: item.excerpt,
			observedAt: item.observed_at,
			metrics: item.metrics,
		})),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function createSupabaseOpportunityRepository(): OpportunityRepository {
	const db = () => getSupabaseService();
	return {
		async list(userId, brandId) {
			const { data, error } = await db()
				.from('content_opportunities')
				.select('*, content_opportunity_evidence(*)')
				.eq('user_id', userId)
				.eq('brand_id', brandId)
				.order('score', { ascending: false });
			if (error) throw new Error(error.message);
			return ((data ?? []) as OpportunityRow[]).map(fromRow);
		},
		async get(userId, id) {
			const { data, error } = await db()
				.from('content_opportunities')
				.select('*, content_opportunity_evidence(*)')
				.eq('user_id', userId)
				.eq('id', id)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? fromRow(data as OpportunityRow) : null;
		},
		async findByKey(userId, brandId, naturalKey) {
			const { data, error } = await db()
				.from('content_opportunities')
				.select('*, content_opportunity_evidence(*)')
				.eq('user_id', userId)
				.eq('brand_id', brandId)
				.eq('natural_key', naturalKey)
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? fromRow(data as OpportunityRow) : null;
		},
		async save(userId, opportunity) {
			const existing = await this.findByKey(userId, opportunity.brandId, opportunity.naturalKey);
			if (existing) return existing;
			const { data, error } = await db()
				.from('content_opportunities')
				.insert({
					user_id: userId,
					brand_id: opportunity.brandId,
					campaign_id: opportunity.campaignId,
					title: opportunity.title,
					audience_problem: opportunity.audienceProblem,
					search_intent: opportunity.searchIntent,
					demand_class: opportunity.demandClass,
					evidence_confidence: opportunity.evidenceConfidence,
					score: opportunity.score,
					score_detail: opportunity.scoreDetail,
					overlap: opportunity.overlap,
					recommended_action: opportunity.recommendedAction,
					status: opportunity.status,
					discovery_source: opportunity.discoverySource,
					natural_key: opportunity.naturalKey,
				})
				.select('*')
				.single();
			if (error) throw new Error(error.message);
			if (opportunity.evidence.length) {
				const { error: evidenceError } = await db().from('content_opportunity_evidence').insert(
					opportunity.evidence.map((item) => ({
						user_id: userId,
						opportunity_id: data.id,
						source_kind: item.sourceKind,
						url: item.url,
						excerpt: item.excerpt,
						observed_at: item.observedAt,
						metrics: item.metrics,
					})),
				);
				if (evidenceError) throw new Error(evidenceError.message);
			}
			const saved = await this.findByKey(userId, opportunity.brandId, opportunity.naturalKey);
			if (!saved) throw new Error('The opportunity was saved but could not be read back.');
			return saved;
		},
		async setStatus(userId, id, status) {
			const { data, error } = await db()
				.from('content_opportunities')
				.update({ status, updated_at: new Date().toISOString() })
				.eq('user_id', userId)
				.eq('id', id)
				.select('*, content_opportunity_evidence(*)')
				.single();
			if (error) throw new Error(error.message);
			return fromRow(data as OpportunityRow);
		},
		async appendEvidence(userId, id, evidence) {
			const current = await this.get(userId, id);
			if (!current) throw new Error('Opportunity not found.');
			const seen = new Set(current.evidence.map((item) => `${item.sourceKind}:${item.url ?? ''}`));
			const fresh = evidence.filter((item) => !seen.has(`${item.sourceKind}:${item.url ?? ''}`));
			if (fresh.length) {
				const { error } = await db().from('content_opportunity_evidence').insert(fresh.map((item) => ({
					user_id: userId,
					opportunity_id: id,
					source_kind: item.sourceKind,
					url: item.url,
					excerpt: item.excerpt,
					observed_at: item.observedAt,
					metrics: item.metrics,
				})));
				if (error) throw new Error(error.message);
			}
			const saved = await this.get(userId, id);
			if (!saved) throw new Error('Opportunity not found.');
			return saved;
		},
		async applyRescore(userId, id, patch) {
			const { data, error } = await db()
				.from('content_opportunities')
				.update({ evidence_confidence: patch.evidenceConfidence, score_detail: patch.scoreDetail, updated_at: new Date().toISOString() })
				.eq('user_id', userId)
				.eq('id', id)
				.select('*, content_opportunity_evidence(*)')
				.single();
			if (error) throw new Error(error.message);
			return fromRow(data as OpportunityRow);
		},
		async updateAssessment(userId, id, patch) {
			const { data, error } = await db()
				.from('content_opportunities')
				.update({
					overlap: patch.overlap,
					recommended_action: patch.recommendedAction,
					status: patch.status,
					score_detail: patch.scoreDetail,
					updated_at: new Date().toISOString(),
				})
				.eq('user_id', userId)
				.eq('id', id)
				.select('*, content_opportunity_evidence(*)')
				.single();
			if (error) throw new Error(error.message);
			return fromRow(data as OpportunityRow);
		},
		async listCampaigns(userId, brandId) {
			const { data, error } = await db().from('content_campaigns').select('*').eq('user_id', userId).eq('brand_id', brandId).order('created_at', { ascending: false });
			if (error) throw new Error(error.message);
			return (data ?? []).map(campaignFromRow);
		},
		async saveCampaign(userId, campaign) {
			const { data, error } = await db()
				.from('content_campaigns')
				.insert({
					user_id: userId,
					brand_id: campaign.brandId,
					name: campaign.name,
					objective: campaign.objective,
					audience: campaign.audience,
					themes: campaign.themes,
					weekly_capacity: campaign.weeklyCapacity,
					selection_policy: campaign.selectionPolicy,
					approval_mode: campaign.approvalMode,
					auto_publish_enabled: false,
					destination_id: campaign.destinationId,
					status: campaign.status,
					quality_policy: campaign.operation ?? {},
				})
				.select('*')
				.single();
			if (error) throw new Error(error.message);
			return campaignFromRow(data);
		},
		async updateCampaign(userId, id, patch) {
			const { data: row, error: readError } = await db().from('content_campaigns').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
			if (readError) throw new Error(readError.message);
			if (!row) throw new Error('Campaign not found.');
			const existing = campaignFromRow(row);
			const operation = patch.operation ?? existing.operation;
			const { data, error } = await db()
				.from('content_campaigns')
				.update({
					status: patch.status ?? existing.status,
					weekly_capacity: patch.weeklyCapacity ?? existing.weeklyCapacity,
					approval_mode: patch.approvalMode ?? existing.approvalMode,
					themes: patch.themes ?? existing.themes,
					quality_policy: operation ?? {},
					auto_publish_enabled: false,
					updated_at: new Date().toISOString(),
				})
				.eq('user_id', userId)
				.eq('id', id)
				.select('*')
				.single();
			if (error) throw new Error(error.message);
			return campaignFromRow(data);
		},
		async getBinding(userId, brandId) {
			const { data, error } = await db().from('content_analytics_bindings').select('*').eq('user_id', userId).eq('brand_id', brandId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? bindingFromRow(data) : null;
		},
		async recordAnalyticsCheck(userId, brandId, patch) {
			const current = await this.getBinding(userId, brandId);
			const next = {
				user_id: userId,
				brand_id: brandId,
				search_console_site_url: patch.searchConsoleSiteUrl === undefined ? current?.searchConsoleSiteUrl ?? null : patch.searchConsoleSiteUrl,
				ga4_property_id: patch.ga4PropertyId === undefined ? current?.ga4PropertyId ?? null : patch.ga4PropertyId,
				search_console_last_success_at: patch.searchConsoleLastSuccessAt === undefined ? current?.searchConsoleLastSuccessAt ?? null : patch.searchConsoleLastSuccessAt,
				search_console_last_error: patch.searchConsoleLastError === undefined ? current?.searchConsoleLastError ?? null : patch.searchConsoleLastError,
				ga4_last_success_at: patch.ga4LastSuccessAt === undefined ? current?.ga4LastSuccessAt ?? null : patch.ga4LastSuccessAt,
				ga4_last_error: patch.ga4LastError === undefined ? current?.ga4LastError ?? null : patch.ga4LastError,
				updated_at: new Date().toISOString(),
			};
			const { data, error } = await db().from('content_analytics_bindings').upsert(next, { onConflict: 'user_id,brand_id' }).select('*').single();
			if (error) throw new Error(error.message);
			return bindingFromRow(data);
		},
		async listJobs(userId, brandId) {
			const { data, error } = await db().from('content_production_jobs').select('*').eq('user_id', userId).eq('brand_id', brandId).order('updated_at', { ascending: false });
			if (error) throw new Error(error.message);
			return (data ?? []).map(jobFromRow);
		},
		async getJob(userId, id) {
			const { data, error } = await db().from('content_production_jobs').select('*').eq('user_id', userId).eq('id', id).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? jobFromRow(data) : null;
		},
		async getJobByOpportunity(userId, opportunityId) {
			const { data, error } = await db().from('content_production_jobs').select('*').eq('user_id', userId).eq('opportunity_id', opportunityId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? jobFromRow(data) : null;
		},
		async getJobByArticle(userId, articleId) {
			const { data, error } = await db().from('content_production_jobs').select('*').eq('user_id', userId).eq('article_id', articleId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? jobFromRow(data) : null;
		},
		async saveJob(userId, job) {
			const { data, error } = await db().from('content_production_jobs').upsert({
				id: job.id,
				user_id: userId,
				brand_id: job.brandId,
				campaign_id: job.campaignId,
				opportunity_id: job.opportunityId,
				article_id: job.articleId,
				stage: job.stage,
				status: job.status,
				attempt: job.attempt,
				note: job.note,
				last_error: job.error,
				cost_usd: job.costUsd,
				stage_log: job.stageLog,
				updated_at: new Date().toISOString(),
			}, { onConflict: 'id' }).select('*').single();
			if (error) throw new Error(error.message);
			return jobFromRow(data);
		},
	};
}

function jobFromRow(row: {
	id: string;
	brand_id: string;
	campaign_id: string | null;
	opportunity_id: string;
	article_id: string | null;
	stage: ProductionJob['stage'];
	status: ProductionJob['status'];
	attempt: number;
	note: string;
	last_error: string | null;
	cost_usd: number;
	stage_log: ProductionJob['stageLog'];
	created_at: string;
	updated_at: string;
}): ProductionJob {
	return {
		id: row.id,
		brandId: row.brand_id,
		campaignId: row.campaign_id,
		opportunityId: row.opportunity_id,
		articleId: row.article_id,
		stage: row.stage,
		status: row.status,
		attempt: row.attempt,
		note: row.note,
		error: row.last_error,
		costUsd: Number(row.cost_usd ?? 0),
		stageLog: row.stage_log ?? [],
		workType: (row.stage_log ?? []).find((item) => item.workType)?.workType,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function bindingFromRow(row: {
	brand_id: string;
	search_console_site_url: string | null;
	ga4_property_id: string | null;
	search_console_last_success_at: string | null;
	search_console_last_error: string | null;
	ga4_last_success_at: string | null;
	ga4_last_error: string | null;
}): AnalyticsBinding {
	return {
		brandId: row.brand_id,
		searchConsoleSiteUrl: row.search_console_site_url,
		ga4PropertyId: row.ga4_property_id,
		searchConsoleLastSuccessAt: row.search_console_last_success_at,
		searchConsoleLastError: row.search_console_last_error,
		ga4LastSuccessAt: row.ga4_last_success_at,
		ga4LastError: row.ga4_last_error,
	};
}

function campaignFromRow(row: {
	id: string;
	brand_id: string;
	name: string;
	objective: string;
	audience: string;
	themes: string[];
	weekly_capacity: number;
	selection_policy: string;
	approval_mode: ApprovalMode;
	destination_id: string | null;
	status: CampaignStatus;
	quality_policy?: Partial<import('@/lib/operations/policy').BrandOperationPolicy> | null;
	created_at: string;
	updated_at: string;
}): ContentCampaign {
	return {
		id: row.id,
		brandId: row.brand_id,
		name: row.name,
		objective: row.objective,
		audience: row.audience,
		themes: row.themes ?? [],
		weeklyCapacity: row.weekly_capacity,
		selectionPolicy: row.selection_policy,
		approvalMode: row.approval_mode,
		autoPublishEnabled: false,
		destinationId: row.destination_id,
		status: row.status,
		operation: normaliseOperationPolicy({
			approvalMode: row.approval_mode,
			weeklyCapacity: row.weekly_capacity,
			status: row.status,
			themes: row.themes ?? [],
			stored: row.quality_policy ?? null,
		}),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function createMemoryOpportunityRepository(): OpportunityRepository {
	const opportunities: Array<ContentOpportunity & { userId: string; naturalKey: string }> = [];
	const campaigns: Array<ContentCampaign & { userId: string }> = [];
	const bindings: Array<AnalyticsBinding & { userId: string }> = [];
	const jobs: Array<ProductionJob & { userId: string }> = [];
	return {
		async list(userId, brandId) {
			return opportunities.filter((item) => item.userId === userId && item.brandId === brandId).map(({ userId: _user, naturalKey: _key, ...item }) => item);
		},
		async get(userId, id) {
			const found = opportunities.find((item) => item.userId === userId && item.id === id);
			if (!found) return null;
			const { userId: _user, naturalKey: _key, ...item } = found;
			return item;
		},
		async findByKey(userId, brandId, naturalKey) {
			const found = opportunities.find((item) => item.userId === userId && item.brandId === brandId && item.naturalKey === naturalKey);
			if (!found) return null;
			const { userId: _user, naturalKey: _key, ...item } = found;
			return item;
		},
		async save(userId, opportunity) {
			const existing = await this.findByKey(userId, opportunity.brandId, opportunity.naturalKey);
			if (existing) return existing;
			const now = new Date().toISOString();
			const saved = {
				...opportunity,
				id: crypto.randomUUID(),
				userId,
				evidence: opportunity.evidence.map((item) => ({ ...item, id: crypto.randomUUID() })),
				createdAt: now,
				updatedAt: now,
			};
			opportunities.push(saved);
			const { userId: _user, naturalKey: _key, ...item } = saved;
			return item;
		},
		async setStatus(userId, id, status) {
			const found = opportunities.find((item) => item.userId === userId && item.id === id);
			if (!found) throw new Error('Opportunity not found.');
			found.status = status;
			found.updatedAt = new Date().toISOString();
			const { userId: _user, naturalKey: _key, ...item } = found;
			return item;
		},
		async appendEvidence(userId, id, evidence) {
			const found = opportunities.find((item) => item.userId === userId && item.id === id);
			if (!found) throw new Error('Opportunity not found.');
			const seen = new Set(found.evidence.map((item) => `${item.sourceKind}:${item.url ?? ''}`));
			for (const item of evidence) {
				const key = `${item.sourceKind}:${item.url ?? ''}`;
				if (seen.has(key)) continue;
				seen.add(key);
				found.evidence.push({ ...item, id: crypto.randomUUID() });
			}
			found.updatedAt = new Date().toISOString();
			const { userId: _user, naturalKey: _key, ...saved } = found;
			return saved;
		},
		async applyRescore(userId, id, patch) {
			const found = opportunities.find((item) => item.userId === userId && item.id === id);
			if (!found) throw new Error('Opportunity not found.');
			found.evidenceConfidence = patch.evidenceConfidence;
			found.scoreDetail = patch.scoreDetail;
			found.updatedAt = new Date().toISOString();
			const { userId: _user, naturalKey: _key, ...saved } = found;
			return saved;
		},
		async updateAssessment(userId, id, patch) {
			const found = opportunities.find((item) => item.userId === userId && item.id === id);
			if (!found) throw new Error('Opportunity not found.');
			found.overlap = patch.overlap;
			found.recommendedAction = patch.recommendedAction;
			found.status = patch.status;
			found.scoreDetail = patch.scoreDetail;
			found.updatedAt = new Date().toISOString();
			const { userId: _user, naturalKey: _key, ...saved } = found;
			return saved;
		},
		async listCampaigns(userId, brandId) {
			return campaigns.filter((item) => item.userId === userId && item.brandId === brandId).map(({ userId: _user, ...item }) => item);
		},
		async saveCampaign(userId, campaign) {
			const now = new Date().toISOString();
			const saved = { ...campaign, id: crypto.randomUUID(), userId, autoPublishEnabled: false as const, createdAt: now, updatedAt: now };
			campaigns.push(saved);
			const { userId: _user, ...item } = saved;
			return item;
		},
		async updateCampaign(userId, id, patch) {
			const found = campaigns.find((item) => item.userId === userId && item.id === id);
			if (!found) throw new Error('Campaign not found.');
			if (patch.status) found.status = patch.status;
			if (typeof patch.weeklyCapacity === 'number') found.weeklyCapacity = patch.weeklyCapacity;
			if (patch.approvalMode) found.approvalMode = patch.approvalMode;
			if (patch.themes) found.themes = patch.themes;
			if (patch.operation) found.operation = patch.operation;
			found.autoPublishEnabled = false;
			found.updatedAt = new Date().toISOString();
			const { userId: _user, ...item } = found;
			return item;
		},
		async getBinding(userId, brandId) {
			const found = bindings.find((item) => item.userId === userId && item.brandId === brandId);
			if (!found) return null;
			const { userId: _user, ...item } = found;
			return item;
		},
		async recordAnalyticsCheck(userId, brandId, patch) {
			const current = bindings.find((item) => item.userId === userId && item.brandId === brandId);
			const next: AnalyticsBinding & { userId: string } = {
				userId,
				brandId,
				searchConsoleSiteUrl: patch.searchConsoleSiteUrl === undefined ? current?.searchConsoleSiteUrl ?? null : patch.searchConsoleSiteUrl,
				ga4PropertyId: patch.ga4PropertyId === undefined ? current?.ga4PropertyId ?? null : patch.ga4PropertyId,
				searchConsoleLastSuccessAt: patch.searchConsoleLastSuccessAt === undefined ? current?.searchConsoleLastSuccessAt ?? null : patch.searchConsoleLastSuccessAt,
				searchConsoleLastError: patch.searchConsoleLastError === undefined ? current?.searchConsoleLastError ?? null : patch.searchConsoleLastError,
				ga4LastSuccessAt: patch.ga4LastSuccessAt === undefined ? current?.ga4LastSuccessAt ?? null : patch.ga4LastSuccessAt,
				ga4LastError: patch.ga4LastError === undefined ? current?.ga4LastError ?? null : patch.ga4LastError,
			};
			if (current) Object.assign(current, next);
			else bindings.push(next);
			const { userId: _user, ...item } = next;
			return item;
		},
		async listJobs(userId, brandId) {
			return jobs.filter((item) => item.userId === userId && item.brandId === brandId).map(({ userId: _user, ...item }) => item);
		},
		async getJob(userId, id) {
			const found = jobs.find((item) => item.userId === userId && item.id === id);
			if (!found) return null;
			const { userId: _user, ...item } = found;
			return item;
		},
		async getJobByOpportunity(userId, opportunityId) {
			const found = jobs.find((item) => item.userId === userId && item.opportunityId === opportunityId);
			if (!found) return null;
			const { userId: _user, ...item } = found;
			return item;
		},
		async getJobByArticle(userId, articleId) {
			const found = jobs.find((item) => item.userId === userId && item.articleId === articleId);
			if (!found) return null;
			const { userId: _user, ...item } = found;
			return item;
		},
		async saveJob(userId, job) {
			const current = jobs.find((item) => item.userId === userId && item.id === job.id);
			const next = { ...job, userId, updatedAt: new Date().toISOString() };
			if (current) Object.assign(current, next);
			else jobs.push(next);
			const { userId: _user, ...item } = next;
			return item;
		},
	};
}

let override: OpportunityRepository | undefined;

export function setOpportunityRepositoryForTests(repository?: OpportunityRepository): void {
	override = repository;
}

export function getOpportunityRepository(): OpportunityRepository {
	if (override) return override;
	if (process.env.VITEST || process.env.NODE_ENV === 'test') return createMemoryOpportunityRepository();
	return createSupabaseOpportunityRepository();
}
