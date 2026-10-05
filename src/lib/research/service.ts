import { getAgentStore } from '@/lib/agent/controlStore';
import type { ResearchMonitor, ResearchRecord } from '@/lib/agent/types';
import { RESEARCH_LIMITS, decideResearch, searchDepthForDecision } from './policy';
import { runResearch, type PageFetcher } from './run';
import type { SearchProvider } from './search';
import type { MonitorType, ResearchProjectType } from './types';

export async function executeResearch(input: {
	ownerUserId: string;
	brandId: string;
	brandName: string;
	website?: string;
	query: string;
	projectType: ResearchProjectType;
	brandFacts?: string[];
	fetchPage?: PageFetcher;
	search?: SearchProvider;
	researchDecision?: 'NO_RESEARCH_NEEDED' | 'USE_EXISTING_RESEARCH' | 'REFRESH_EXISTING_RESEARCH' | 'QUICK_VERIFY' | 'FULL_RESEARCH';
}): Promise<ResearchRecord> {
	const decision = input.researchDecision ?? decideResearch({ instruction: input.query }).decision;
	const searchDepth = searchDepthForDecision(decision);
	const packet = await runResearch({
		brandName: input.brandName,
		website: input.website,
		query: input.query,
		projectType: input.projectType,
		brandFacts: input.brandFacts,
		ownedDomain: input.website ? new URL(input.website).hostname.replace(/^www\./, '') : undefined,
		fetchPage: input.fetchPage,
		search: input.search,
		searchDepth,
	});
	const saved = await getAgentStore().saveResearch(input.ownerUserId, {
		id: crypto.randomUUID(),
		brandId: input.brandId,
		request: input.query,
		sources: packet.sources.filter((source) => !source.rejected).map((source) => ({
			url: source.url,
			title: source.title,
			retrievedAt: source.retrievedAt,
			excerpt: source.excerpt,
		})),
		claims: packet.claims.map((claim) => ({ text: claim.text, confidence: claim.confidence, sourceUrl: packet.sources.find((source) => source.id === claim.sourceIds[0])?.url })),
		createdAt: new Date().toISOString(),
		note: 'Research claims are not Brand Brain facts.',
		packet,
	});
	await recordResearchOpportunities(input.ownerUserId, input.brandId, packet);
	return saved;
}

async function recordResearchOpportunities(ownerUserId: string, brandId: string, packet: { query: string; trend?: { state: string; reason: string }; contradictions: Array<{ topic: string; evidenceA: string; evidenceB: string; sourceIds: string[] }>; sources: Array<{ id: string; url: string }> }): Promise<void> {
	const store = getAgentStore();
	if (packet.trend && packet.trend.state !== 'INSUFFICIENT_EVIDENCE') {
		await store.saveOpportunity(ownerUserId, {
			id: crypto.randomUUID(),
			brandId,
			source: 'cce_research',
			discoveredBy: 'cce_research',
			discoveredAt: new Date().toISOString(),
			opportunityType: 'trend',
			topic: packet.query,
			summary: packet.trend.reason,
			confidence: packet.trend.state,
			evidence: packet.sources.slice(0, 4).map((source) => ({ url: source.url, retrievedAt: new Date().toISOString() })),
			status: 'new',
		});
	}
	for (const contradiction of packet.contradictions.slice(0, 3)) {
		await store.saveOpportunity(ownerUserId, {
			id: crypto.randomUUID(),
			brandId,
			source: 'cce_research',
			discoveredBy: 'cce_research',
			discoveredAt: new Date().toISOString(),
			opportunityType: 'contradiction',
			topic: contradiction.topic,
			summary: `${contradiction.evidenceA} conflicts with ${contradiction.evidenceB}`,
			evidence: contradiction.sourceIds.map((id) => ({ url: packet.sources.find((source) => source.id === id)?.url })),
			status: 'new',
		});
	}
}

export async function createMonitor(ownerUserId: string, monitor: Omit<ResearchMonitor, 'id' | 'createdAt' | 'nextRunAt'> & { nextRunAt?: string }): Promise<ResearchMonitor> {
	const existing = await getAgentStore().listMonitors(ownerUserId, monitor.brandId);
	if (existing.filter((item) => item.status === 'active').length >= RESEARCH_LIMITS.maxMonitorsPerBrand) {
		throw new Error('monitor_limit_reached');
	}
	const createdAt = new Date().toISOString();
	const next = new Date(Date.now() + monitor.cadenceDays * 24 * 60 * 60 * 1000).toISOString();
	return getAgentStore().saveMonitor(ownerUserId, {
		...monitor,
		id: crypto.randomUUID(),
		createdAt,
		nextRunAt: monitor.nextRunAt ?? next,
	});
}

export function monitorProject(type: MonitorType): ResearchProjectType {
	if (type === 'WEBSITE_CHANGES' || type === 'PRODUCT_CHANGES' || type === 'PRICING_CHANGES') return 'WEBSITE_DISCOVERY';
	if (type === 'COMPETITOR_CHANGES') return 'COMPETITOR_RESEARCH';
	if (type === 'REVIEW_CHANGES') return 'REVIEW_RESEARCH';
	if (type === 'TREND_DISCOVERY') return 'TREND_RESEARCH';
	if (type === 'CATEGORY_NEWS' || type === 'REGULATORY_TOPIC' || type === 'BRAND_MENTIONS') return 'NEWS_MONITORING';
	return 'CURRENT_RESEARCH';
}
