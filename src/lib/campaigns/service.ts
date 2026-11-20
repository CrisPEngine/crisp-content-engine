import { getNativeContentStore } from '@/lib/media/store';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { actionFor, assessOverlap } from './overlap';
import { analyticsSignals, searchConsoleSignals } from './analyticsSignals';
import { fetchGa4Report, type Ga4Report } from './ga4';
import { ANALYTICS_SCOPE, SEARCH_CONSOLE_SCOPE, GoogleProviderError, getGoogleAccessToken } from './googleAuth';
import { resolveBrandProperties } from './googleConfig';
import { providerStatus } from './providers';
import { fetchSearchConsoleReport, type SearchConsoleReport } from './searchConsole';
import { discoverSearchTopic, scoreCandidate, type DiscoveredCandidate } from './discovery';
import { selectObservedOpportunities } from './selection';
import { evidenceConfidence, scoreOpportunity } from './scoring';
import { getOpportunityRepository, type NewCampaign, type OpportunityRepository } from './repository';
import type { BrandBrain } from '@/lib/intelligence/types';
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

async function verifiedCapabilityNames(userId: string, brain: BrandBrain, topic: string): Promise<string[]> {
	const { loadResolvedIntelligence } = await import('@/lib/intelligence/knowledge/load');
	const resolved = await loadResolvedIntelligence(userId, brain, topic || brain.identity.name, 'article');
	return resolved.verified.map((item) => item.name).filter(Boolean);
}

async function attachSearchCoverage(candidates: DiscoveredCandidate[]): Promise<DiscoveredCandidate[]> {
	const targets = candidates.filter((candidate) => candidate.forcedOverlap?.decision === 'create').slice(0, 4);
	if (!targets.length) return candidates;
	const { selectSearchProvider } = await import('@/lib/research/search');
	const provider = selectSearchProvider();
	if (!provider.configured) return candidates;
	for (const candidate of targets) {
		const hits = await provider.search(candidate.title, 4, { depth: 'basic' }).catch(() => []);
		const observedAt = new Date().toISOString();
		for (const hit of hits) {
			candidate.evidence.push({
				sourceKind: 'search',
				url: hit.url,
				excerpt: hit.snippet?.slice(0, 500) ?? hit.title ?? null,
				observedAt: hit.publishedAt ?? observedAt,
				metrics: null,
			});
		}
		if (hits.length) {
			candidate.businessRationale = `${candidate.businessRationale} ${hits.length} public pages were retrieved for coverage. No search volume was supplied.`;
		}
	}
	return candidates;
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

export async function listContentOpportunities(userId: string, brandId: string): Promise<{ opportunities: ContentOpportunity[]; campaigns: ContentCampaign[]; jobs: import('./types').ProductionJob[]; providers: ReturnType<typeof providerStatus> }> {
	const repository = getOpportunityRepository();
	const [opportunities, campaigns, binding, jobs] = await Promise.all([
		repository.list(userId, brandId),
		repository.listCampaigns(userId, brandId),
		repository.getBinding(userId, brandId),
		repository.listJobs(userId, brandId),
	]);
	return { opportunities, campaigns, jobs, providers: providerStatus({ brandId, binding }) };
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
	source: 'search' | 'community' | 'search_console' | 'themes' | 'market' | 'pillars';
	topic?: string;
	startDate?: string;
	endDate?: string;
	areas?: string[];
}): Promise<ContentOpportunity[]> {
	const inventory = await inventoryFor(userId, input.brandId);
	const repository = getOpportunityRepository();
	if (input.source === 'pillars') {
		const { selectSearchProvider } = await import('@/lib/research/search');
		const { PILLAR_SEARCHES, candidatesFromPillarHits } = await import('./discovery');
		const provider = selectSearchProvider();
		if (!provider.configured) throw new CampaignError('Pillar research needs Tavily or Brave.', 409, 'search_provider_not_configured');
		const brain = await getIntelligenceStore().getBrandBrainById(userId, input.brandId);
		const themes = brain ? (await getIntelligenceStore().listThemes(userId, brain.id)).filter((theme) => theme.status === 'active').map((theme) => theme.title) : [];
		const pillars = [...new Set([...themes, 'Novel planning', 'Story continuity', 'Writing workflows', 'AI-assisted writing', 'Writing software comparisons'])];
		const selected = PILLAR_SEARCHES.filter((item) => pillars.some((pillar) => pillar.toLowerCase() === item.pillar.toLowerCase()));
		const retrievedAt = new Date().toISOString();
		const candidates: DiscoveredCandidate[] = [];
		let firstError: unknown = null;
		for (const item of selected) {
			try {
				const hits = await provider.search(item.query, 5, { depth: 'basic' });
				candidates.push(...candidatesFromPillarHits({ pillar: item.pillar, query: item.query, hits, inventory, retrievedAt }));
			} catch (error) {
				firstError ??= error;
			}
		}
		if (!candidates.length && firstError) throw firstError;
		return persistCandidates(userId, input.brandId, candidates, repository, inventory);
	}
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
	if (input.source === 'market') {
		const { researchAreaQueries, researchQueries, candidatesFromMarket } = await import('./market');
		const { sameOpportunity } = await import('./dedupe');
		const { selectSearchProvider } = await import('@/lib/research/search');
		const provider = selectSearchProvider();
		if (!provider.configured) throw new CampaignError('Market research needs Tavily or Brave.', 409, 'search_provider_not_configured');
		const brain = await getIntelligenceStore().getBrandBrainById(userId, input.brandId);
		const strategy = brain ? await getIntelligenceStore().getStrategyForBrand(userId, brain.id) : null;
		const themes = (await getIntelligenceStore().listThemes(userId, input.brandId)).filter((theme) => theme.status === 'active');
		const approvedProblems = [...(strategy?.audienceProblems ?? []), ...themes.flatMap((theme) => theme.questionsToAnswer ?? [])];
		const queries = input.areas?.length ? researchAreaQueries(input.areas) : researchQueries({
			brandName: brain?.identity.name ?? '',
			problems: strategy?.audienceProblems ?? [],
			pillars: strategy?.contentPillars ?? [],
			questions: themes.flatMap((theme) => theme.questionsToAnswer ?? []),
		});
		if (!queries.length) throw new CampaignError('Practical audience problems are required. Positioning questions were not turned into article titles.', 409, 'market_problems_missing');
		const retrievedAt = new Date().toISOString();
		const researched = [];
		for (const query of queries) {
			const hits = await provider.search(query, 5, { depth: 'basic' }).catch(() => []);
			researched.push({ query, hits });
		}
		let host: string | null = null;
		try {
			host = brain?.identity.website ? new URL(brain.identity.website.startsWith('http') ? brain.identity.website : `https://${brain.identity.website}`).host : null;
		} catch {
			host = null;
		}
		const capabilities = brain ? await verifiedCapabilityNames(userId, brain, approvedProblems.join(' ')) : [];
		const discovered = candidatesFromMarket({ queries: researched, inventory, brandHost: host, retrievedAt, capabilities, approvedProblems });
		const existing = await repository.list(userId, input.brandId);
		const fresh = [];
		for (const candidate of discovered.candidates) {
			const match = existing.find((item) => sameOpportunity(item.audienceProblem, candidate.audienceProblem) || sameOpportunity(item.title, candidate.title));
			if (!match) {
				fresh.push(candidate);
				continue;
			}
			await repository.appendEvidence(userId, match.id, candidate.evidence.map((item) => ({ ...item, id: '' })));
		}
		return persistCandidates(userId, input.brandId, fresh, repository, inventory);
	}
	if (!input.topic?.trim() && input.source !== 'search_console') throw new CampaignError('Enter a topic to research.', 400, 'topic_required');
	if (input.source === 'search_console') {
		const end = input.endDate ?? new Date().toISOString().slice(0, 10);
		const start = input.startDate ?? new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
		try {
			const binding = await repository.getBinding(userId, input.brandId);
			const properties = resolveBrandProperties(input.brandId, process.env, binding);
			if (!properties.searchConsoleSiteUrl) throw new GoogleProviderError('This brand has no Search Console property.', 'search_console_not_bound');
			const accessToken = await getGoogleAccessToken({ env: process.env, scopes: [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE] });
			const report = await fetchSearchConsoleReport({
				siteUrl: properties.searchConsoleSiteUrl,
				startDate: start,
				endDate: end,
				accessToken,
				maxRows: 250,
			});
			const analytics = properties.ga4PropertyId
				? await fetchGa4Report({ propertyId: properties.ga4PropertyId, startDate: start, endDate: end, accessToken, maxRows: 100 }).catch(() => null)
				: null;
			const brain = await getIntelligenceStore().getBrandBrainById(userId, input.brandId);
			const verified = brain ? await verifiedCapabilityNames(userId, brain, input.topic ?? '') : [];
			const themes = (await getIntelligenceStore().listThemes(userId, input.brandId)).filter((theme) => theme.status === 'active').map((theme) => theme.title);
			let candidates = selectObservedOpportunities({
				siteUrl: report.siteUrl,
				startDate: start,
				endDate: end,
				retrievedAt: report.retrievedAt,
				queries: report.queries,
				queryPages: report.queryPages,
				pages: report.pages,
				inventory,
				brandTerms: [brain?.identity.name ?? ''].filter(Boolean),
				verifiedCapabilities: verified,
				themes,
				landingPages: analytics?.landingPages ?? [],
			});
			candidates = await attachSearchCoverage(candidates);
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

export async function rescoreStoredEvidence(userId: string, brandId: string): Promise<Array<{ id: string; title: string; from: string; to: string; scope: 'query' | 'page' | null }>> {
	const repository = getOpportunityRepository();
	const rows = await repository.list(userId, brandId);
	const changes = [];
	for (const row of rows) {
		if (row.brandId !== brandId || row.demandClass !== 'observed') continue;
		const { rescoredConfidence, storedEvidenceScope } = await import('./scoring');
		const scope = storedEvidenceScope(row.evidence);
		const next = rescoredConfidence({ demandClass: row.demandClass, evidence: row.evidence });
		const scoreDetail = {
			...row.scoreDetail,
			confidence: next,
			rescore: {
				at: new Date().toISOString(),
				previousConfidence: row.evidenceConfidence,
				confidence: next,
				reason: scope === 'page'
					? 'Page impressions are not exact-query demand, so confidence is medium. Measured impressions, clicks, CTR, and position were not changed.'
					: 'Query evidence was rescored with the configured threshold. Measured impressions, clicks, CTR, and position were not changed.',
				metricsUnchanged: true as const,
				scope,
			},
		};
		await repository.applyRescore(userId, row.id, { evidenceConfidence: next, scoreDetail });
		changes.push({ id: row.id, title: row.title, from: row.evidenceConfidence, to: next, scope });
	}
	return changes;
}

export async function archiveWeakOpportunities(userId: string, brandId: string): Promise<Array<{ id: string; title: string }>> {
	const repository = getOpportunityRepository();
	const { shouldArchiveOpportunity } = await import('./queue');
	const rows = await repository.list(userId, brandId);
	const archived = [];
	for (const row of rows) {
		if (row.brandId !== brandId || !shouldArchiveOpportunity(row)) continue;
		await repository.setStatus(userId, row.id, 'archived');
		archived.push({ id: row.id, title: row.title });
	}
	return archived;
}

export async function approveDistinctShortlist(userId: string, brandId: string): Promise<ContentOpportunity[]> {
	const { selectDistinctOpportunities, selectionRationale } = await import('./lanes');
	const repository = getOpportunityRepository();
	const chosen = selectDistinctOpportunities(await repository.list(userId, brandId), 5);
	const saved: ContentOpportunity[] = [];
	for (const item of chosen) {
		const scoreDetail = { ...item.scoreDetail, selectionRationale: selectionRationale(item) };
		await repository.applyRescore(userId, item.id, { evidenceConfidence: item.evidenceConfidence, scoreDetail });
		saved.push(item.status === 'approved' ? { ...item, scoreDetail } : await decideOpportunity(userId, item.id, 'approved'));
	}
	return saved;
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
