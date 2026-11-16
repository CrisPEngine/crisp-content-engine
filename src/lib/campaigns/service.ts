import { getNativeContentStore } from '@/lib/media/store';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { actionFor, assessOverlap } from './overlap';
import { providerAvailability } from './providers';
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

export async function listContentOpportunities(userId: string, brandId: string): Promise<{ opportunities: ContentOpportunity[]; campaigns: ContentCampaign[]; providers: ReturnType<typeof providerAvailability> }> {
	const repository = getOpportunityRepository();
	const [opportunities, campaigns] = await Promise.all([
		repository.list(userId, brandId),
		repository.listCampaigns(userId, brandId),
	]);
	return { opportunities, campaigns, providers: providerAvailability() };
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
			const candidates = await discoverSearchConsole({ startDate: start, endDate: end, inventory });
			return persistCandidates(userId, input.brandId, candidates, repository, inventory);
		} catch (error) {
			const coded = error as Error & { code?: string };
			throw new CampaignError(coded.message, coded.code === 'search_console_not_configured' ? 409 : 502, coded.code ?? 'search_console_failed');
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

export async function createContentCampaign(userId: string, input: NewCampaign): Promise<ContentCampaign> {
	if (input.approvalMode === 'auto_publish') {
		throw new CampaignError('Auto-publish stays off until an owner enables it after the pilot checks. Create the campaign in assisted or auto-draft mode.', 403, 'auto_publish_locked');
	}
	return getOpportunityRepository().saveCampaign(userId, { ...input, weeklyCapacity: Math.max(0, input.weeklyCapacity) });
}
