import { getNativeContentStore } from '@/lib/media/store';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { actionFor, assessOverlap } from './overlap';
import { analyticsSignals, searchConsoleSignals } from './analyticsSignals';
import { fetchGa4Report, type Ga4Report } from './ga4';
import { ANALYTICS_SCOPE, SEARCH_CONSOLE_SCOPE, GoogleProviderError, getGoogleAccessToken } from './googleAuth';
import { resolveBrandProperties } from './googleConfig';
import { providerStatus } from './providers';
import { fetchSearchConsoleReport, type SearchConsoleReport } from './searchConsole';
import { discoverSearchConsole, discoverSearchTopic, scoreCandidate, type DiscoveredCandidate } from './discovery';
import { evidenceConfidence, scoreOpportunity } from './scoring';
import { getOpportunityRepository, type NewCampaign, type OpportunityRepository } from './repository';
import type { ContentCampaign, ContentOpportunity, DemandClass, InventoryArticle, OpportunityStatus } from './types';

export class CampaignError extends Error {
	status: number;
	code: string;
	constructor(message: string, status = 400, code = 'campaign_error') {
		super(message);
		this.status = status;
		this.code = code;
	}
}

async function inventoryFor(userId: string, brandId: string): Promise<InventoryArticle[]> {
	const articles = await getNativeContentStore().listArticles(userId, brandId);
	return articles.map((article) => ({
		id: article.id,
		title: article.title || article.topic,
		topic: article.topic,
		keyword: article.primaryKeyword ?? article.seo.primaryKeyword ?? null,
		intent: article.searchIntent ?? null,
		status: article.status,
		url: article.publication?.url ?? null,
	}));
}

async function persistCandidates(userId: string, brandId: string, candidates: DiscoveredCandidate[], repository: OpportunityRepository, inventory: InventoryArticle[]): Promise<ContentOpportunity[]> {
	const saved: ContentOpportunity[] = [];
	for (const candidate of candidates) {
		const { overlap, scored } = scoreCandidate(candidate, inventory);
		saved.push(await repository.save(userId, {
			brandId,
			campaignId: null,
			title: candidate.title,
			audienceProblem: candidate.audienceProblem,
			searchIntent: candidate.searchIntent,
			demandClass: candidate.demandClass,
			evidenceConfidence: scored.confidence,
			score: scored.score,
			scoreDetail: scored,
			overlap,
			recommendedAction: actionFor(overlap, scored.promotionBlocked),
			status: scored.promotionBlocked ? 'needs_research' : 'discovered',
			discoverySource: candidate.discoverySource,
			naturalKey: candidate.naturalKey,
			evidence: candidate.evidence.map((item) => ({ ...item, id: '' })),
		}));
	}
	return saved;
}

export async function listContentOpportunities(userId: string, brandId: string): Promise<{ opportunities: ContentOpportunity[]; campaigns: ContentCampaign[]; providers: ReturnType<typeof providerStatus> }> {
	const repository = getOpportunityRepository();
	const [opportunities, campaigns, binding] = await Promise.all([
		repository.list(userId, brandId),
		repository.listCampaigns(userId, brandId),
		repository.getBinding(userId, brandId),
	]);
	return { opportunities, campaigns, providers: providerStatus({ brandId, binding }) };
}

export async function recordContentOpportunity(userId: string, input: {
	brandId: string;
	title: string;
	audienceProblem: string;
	searchIntent?: string;
	demandClass: DemandClass;
	sourceUrl?: string;
	excerpt?: string;
}): Promise<ContentOpportunity> {
	if (input.demandClass === 'observed') {
		throw new CampaignError('Observed demand can only be recorded from Search Console results.', 400, 'observed_requires_provider');
	}
	const inventory = await inventoryFor(userId, input.brandId);
	const overlap = assessOverlap({ title: input.title, intent: input.searchIntent }, inventory);
	const evidence = input.sourceUrl ? [{ id: '', sourceKind: 'operator', url: input.sourceUrl, excerpt: input.excerpt ?? null, observedAt: new Date().toISOString(), metrics: null }] : [];
	const scored = scoreOpportunity({
		demandClass: input.demandClass,
		evidenceCount: evidence.length,
		brandRelevance: 0.5,
		brandRationale: 'An operator recorded this for the selected brand. Brand fit has not been measured.',
		uniqueValue: overlap.decision === 'create' ? 0.7 : 0.3,
		uniqueRationale: overlap.rationale,
		businessRelevance: 0.4,
		businessRationale: 'No business metric was supplied.',
		researchFeasibility: evidence.length ? 0.6 : 0.3,
		researchRationale: evidence.length ? 'The operator supplied a source URL.' : 'No source URL was supplied.',
	});
	const confidence = evidenceConfidence(input.demandClass, evidence.length, null);
	return getOpportunityRepository().save(userId, {
		brandId: input.brandId,
		campaignId: null,
		title: input.title.trim(),
		audienceProblem: input.audienceProblem.trim(),
		searchIntent: input.searchIntent ?? null,
		demandClass: input.demandClass,
		evidenceConfidence: confidence,
		score: scored.score,
		scoreDetail: { ...scored, confidence },
		overlap,
		recommendedAction: actionFor(overlap, scored.promotionBlocked || confidence === 'none'),
		status: input.demandClass === 'unvalidated' ? 'needs_research' : 'discovered',
		discoverySource: 'operator',
		naturalKey: `operator:${input.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
		evidence,
	});
}

export async function discoverOpportunities(userId: string, input: {
	brandId: string;
	source: 'search' | 'community' | 'search_console' | 'themes';
	topic?: string;
	startDate?: string;
	endDate?: string;
}): Promise<ContentOpportunity[]> {
	const inventory = await inventoryFor(userId, input.brandId);
	const repository = getOpportunityRepository();
	if (input.source === 'themes') {
		const themes = await getIntelligenceStore().listThemes(userId, input.brandId);
		const active = themes.filter((theme) => theme.status === 'active');
		const candidates: DiscoveredCandidate[] = active.map((theme) => ({
			title: theme.title,
			audienceProblem: theme.description || theme.objective || 'Approved theme. No audience measurement is attached.',
			searchIntent: null,
			demandClass: 'strategic',
			discoverySource: 'strategy',
			naturalKey: `strategy:${theme.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
			evidence: [],
			brandRelevance: 0.75,
			brandRationale: 'The theme is already approved in Brand Intelligence.',
			businessRelevance: 0.4,
			businessRationale: 'No performance metric is attached to this theme.',
		}));
		return persistCandidates(userId, input.brandId, candidates, repository, inventory);
	}
	if (!input.topic?.trim() && input.source !== 'search_console') throw new CampaignError('Enter a topic to research.', 400, 'topic_required');
	if (input.source === 'search_console') {
		const end = input.endDate ?? new Date().toISOString().slice(0, 10);
		const start = input.startDate ?? new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		try {
			const binding = await repository.getBinding(userId, input.brandId);
			const properties = resolveBrandProperties(input.brandId, process.env, binding);
			if (!properties.searchConsoleSiteUrl) throw new GoogleProviderError('This brand has no Search Console property.', 'search_console_not_bound');
			const accessToken = await getGoogleAccessToken({ env: process.env, scopes: [SEARCH_CONSOLE_SCOPE] });
			const candidates = await discoverSearchConsole({ siteUrl: properties.searchConsoleSiteUrl, startDate: start, endDate: end, accessToken });
			return persistCandidates(userId, input.brandId, candidates, repository, inventory);
		} catch (error) {
			throw campaignFromGoogle(error);
		}
	}
	try {
		const brain = await getIntelligenceStore().getBrandBrainById(userId, input.brandId);
		const candidates = await discoverSearchTopic({
			topic: input.topic!.trim(),
			source: input.source,
			inventory,
			brandTerms: [brain?.identity.name ?? ''].filter(Boolean),
		});
		return persistCandidates(userId, input.brandId, candidates, repository, inventory);
	} catch (error) {
		const coded = error as Error & { code?: string };
		throw new CampaignError(coded.message, coded.code === 'search_provider_not_configured' ? 409 : 502, coded.code ?? 'search_failed');
	}
}

export async function decideOpportunity(userId: string, id: string, status: OpportunityStatus): Promise<ContentOpportunity> {
	const repository = getOpportunityRepository();
	const all = await repository.get(userId, id);
	if (!all) throw new CampaignError('Opportunity not found.', 404, 'opportunity_missing');
	if (status === 'approved' || status === 'in_production') {
		if (all.scoreDetail.promotionBlocked || all.demandClass === 'unvalidated' || all.evidenceConfidence === 'none') {
			throw new CampaignError(all.scoreDetail.blockReason ?? 'This opportunity needs evidence before it can be approved.', 409, 'evidence_required');
		}
		if (all.recommendedAction === 'reject') {
			throw new CampaignError('This overlaps an existing article too closely to approve a new one. Choose update work on the existing article instead.', 409, 'overlap_reject');
		}
	}
	return repository.setStatus(userId, id, status);
}

export type ConnectionCheck = {
	wroteOpportunities: false;
	searchConsole: {
		state: 'connected' | 'unavailable' | 'error';
		property: string | null;
		retrievedAt: string | null;
		error: string | null;
		queryCount: number;
		pageCount: number;
		signals: ReturnType<typeof searchConsoleSignals>;
		queries: SearchConsoleReport['queries'];
	};
	analytics: {
		state: 'connected' | 'unavailable' | 'error';
		property: string | null;
		retrievedAt: string | null;
		error: string | null;
		keyEvents: Ga4Report['keyEvents'] | null;
		organic: Ga4Report['organic'] | null;
		landingPages: Ga4Report['landingPages'];
		sources: Ga4Report['sources'];
		signals: ReturnType<typeof analyticsSignals>;
	};
};

function dates(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
	const end = endDate ?? new Date().toISOString().slice(0, 10);
	const start = startDate ?? new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
		throw new CampaignError('Use YYYY-MM-DD dates.', 400, 'invalid_date');
	}
	return { startDate: start, endDate: end };
}

function campaignFromGoogle(error: unknown): CampaignError {
	if (error instanceof CampaignError) return error;
	if (error instanceof GoogleProviderError) {
		const status = error.status === 403 ? 403 : error.code.endsWith('not_bound') || error.code.includes('missing') || error.code.includes('invalid') ? 409 : 502;
		return new CampaignError(error.message, status, error.code);
	}
	const coded = error as Error & { code?: string };
	return new CampaignError(coded.message || 'Google request failed.', 502, coded.code ?? 'google_failed');
}

export async function testBrandAnalytics(userId: string, brandId: string, input: {
	startDate?: string;
	endDate?: string;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	tokenClient?: { getAccessToken: () => Promise<{ token?: string | null }> };
	record?: boolean;
} = {}): Promise<ConnectionCheck> {
	const repository = getOpportunityRepository();
	const before = await repository.list(userId, brandId);
	const env = input.env ?? process.env;
	const binding = await repository.getBinding(userId, brandId);
	const properties = resolveBrandProperties(brandId, env, binding);
	const range = dates(input.startDate, input.endDate);
	const result: ConnectionCheck = {
		wroteOpportunities: false,
		searchConsole: { state: properties.searchConsoleSiteUrl ? 'unavailable' : 'unavailable', property: properties.searchConsoleSiteUrl, retrievedAt: null, error: properties.bindingError, queryCount: 0, pageCount: 0, signals: [], queries: [] },
		analytics: { state: 'unavailable', property: properties.ga4PropertyId, retrievedAt: null, error: properties.bindingError, keyEvents: null, organic: null, landingPages: [], sources: [], signals: [] },
	};
	if (!properties.searchConsoleSiteUrl && !properties.ga4PropertyId) {
		result.searchConsole.error = properties.bindingError ?? 'This brand has no Search Console property.';
		result.analytics.error = properties.bindingError ?? 'This brand has no GA4 property.';
		return result;
	}
	let accessToken: string;
	try {
		accessToken = await getGoogleAccessToken({ env, scopes: [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE], fetchImpl: input.fetchImpl, tokenClient: input.tokenClient });
	} catch (error) {
		const wrapped = campaignFromGoogle(error);
		if (properties.searchConsoleSiteUrl) {
			result.searchConsole.state = 'error';
			result.searchConsole.error = wrapped.message;
		}
		if (properties.ga4PropertyId) {
			result.analytics.state = 'error';
			result.analytics.error = wrapped.message;
		}
		if (input.record !== false) {
			await repository.recordAnalyticsCheck(userId, brandId, {
				...(properties.searchConsoleSiteUrl ? { searchConsoleSiteUrl: properties.searchConsoleSiteUrl, searchConsoleLastError: wrapped.message } : {}),
				...(properties.ga4PropertyId ? { ga4PropertyId: properties.ga4PropertyId, ga4LastError: wrapped.message } : {}),
			});
		}
		return result;
	}
	if (properties.searchConsoleSiteUrl) {
		try {
			const report = await fetchSearchConsoleReport({ ...range, siteUrl: properties.searchConsoleSiteUrl, accessToken, fetchImpl: input.fetchImpl, maxRows: 250 });
			const inventory = await inventoryFor(userId, brandId);
			result.searchConsole = {
				state: 'connected',
				property: report.siteUrl,
				retrievedAt: report.retrievedAt,
				error: null,
				queryCount: report.queries.length,
				pageCount: report.pages.length,
				signals: searchConsoleSignals(report, inventory).slice(0, 25),
				queries: report.queries.slice(0, 25),
			};
		} catch (error) {
			const wrapped = campaignFromGoogle(error);
			result.searchConsole.state = 'error';
			result.searchConsole.error = wrapped.message;
		}
	}
	if (properties.ga4PropertyId) {
		try {
			const report = await fetchGa4Report({ ...range, propertyId: properties.ga4PropertyId, accessToken, fetchImpl: input.fetchImpl, maxRows: 100 });
			result.analytics = {
				state: 'connected',
				property: report.propertyId,
				retrievedAt: report.retrievedAt,
				error: null,
				keyEvents: report.keyEvents,
				organic: report.organic,
				landingPages: report.landingPages.slice(0, 25),
				sources: report.sources.slice(0, 25),
				signals: analyticsSignals(report).slice(0, 25),
			};
		} catch (error) {
			const wrapped = campaignFromGoogle(error);
			result.analytics.state = 'error';
			result.analytics.error = wrapped.message;
		}
	}
	if (input.record !== false) {
		await repository.recordAnalyticsCheck(userId, brandId, {
			...(properties.searchConsoleSiteUrl ? {
				searchConsoleSiteUrl: properties.searchConsoleSiteUrl,
				searchConsoleLastError: result.searchConsole.error,
				...(result.searchConsole.retrievedAt ? { searchConsoleLastSuccessAt: result.searchConsole.retrievedAt } : {}),
			} : {}),
			...(properties.ga4PropertyId ? {
				ga4PropertyId: properties.ga4PropertyId,
				ga4LastError: result.analytics.error,
				...(result.analytics.retrievedAt ? { ga4LastSuccessAt: result.analytics.retrievedAt } : {}),
			} : {}),
		});
	}
	const after = await repository.list(userId, brandId);
	if (after.length !== before.length) throw new CampaignError('The connection test changed the opportunity queue.', 500, 'connection_test_wrote');
	return result;
}

export async function createContentCampaign(userId: string, input: NewCampaign): Promise<ContentCampaign> {
	if (input.approvalMode === 'auto_publish') {
		throw new CampaignError('Auto-publish stays off until an owner enables it after the pilot checks. Create the campaign in assisted or auto-draft mode.', 403, 'auto_publish_locked');
	}
	return getOpportunityRepository().saveCampaign(userId, { ...input, weeklyCapacity: Math.max(0, input.weeklyCapacity) });
}
