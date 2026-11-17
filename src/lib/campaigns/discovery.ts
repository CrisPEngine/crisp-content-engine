import { selectSearchProvider, type SearchHit } from '@/lib/research/search';
import { assessOverlap } from './overlap';
import { fetchSearchConsoleReport, type SearchConsoleQuery } from './searchConsole';
import { evidenceConfidence, scoreOpportunity } from './scoring';
import type { DemandClass, InventoryArticle, MeasuredSearch } from './types';

export type DiscoveredCandidate = {
	title: string;
	audienceProblem: string;
	searchIntent: string | null;
	demandClass: DemandClass;
	discoverySource: string;
	naturalKey: string;
	evidence: Array<{ sourceKind: string; url: string | null; excerpt: string | null; observedAt: string | null; metrics: MeasuredSearch | null }>;
	brandRelevance: number;
	brandRationale: string;
	businessRelevance: number;
	businessRationale: string;
};

function key(source: string, title: string): string {
	return `${source}:${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

function hosts(hits: SearchHit[]): string[] {
	const found = new Set<string>();
	for (const hit of hits) {
		try {
			found.add(new URL(hit.url).host);
		} catch {
			/* ignore malformed provider urls */
		}
	}
	return [...found];
}

export function candidatesFromSearch(input: {
	topic: string;
	hits: SearchHit[];
	source: 'search' | 'community';
	inventory: InventoryArticle[];
	brandTerms: string[];
}): DiscoveredCandidate[] {
	if (!input.hits.length) return [];
	const coverage = hosts(input.hits);
	const observedAt = new Date().toISOString();
	const overlap = assessOverlap({ title: input.topic }, input.inventory);
	const brandHit = input.brandTerms.some((term) => input.topic.toLowerCase().includes(term.toLowerCase()));
	return [{
		title: input.topic.trim(),
		audienceProblem: input.hits[0]?.snippet?.slice(0, 280) || input.topic,
		searchIntent: 'informational',
		demandClass: 'inferred',
		discoverySource: input.source,
		naturalKey: key(input.source, input.topic),
		evidence: input.hits.slice(0, 5).map((hit) => ({
			sourceKind: input.source,
			url: hit.url,
			excerpt: hit.snippet?.slice(0, 500) ?? hit.title ?? null,
			observedAt: hit.publishedAt ?? observedAt,
			metrics: null,
		})),
		brandRelevance: brandHit ? 0.8 : 0.45,
		brandRationale: brandHit
			? 'The query names the brand or a known product term. Relevance is editorial, not a traffic measurement.'
			: 'The query does not name the brand. Relevance is limited to whether the topic fits the audience.',
		businessRelevance: overlap.decision === 'reject' ? 0.2 : 0.5,
		businessRationale: `${coverage.length} distinct site${coverage.length === 1 ? '' : 's'} cover this query: ${coverage.slice(0, 4).join(', ') || 'none listed'}. No search volume was supplied.`,
	}];
}

export async function discoverSearchTopic(input: {
	topic: string;
	source: 'search' | 'community';
	inventory: InventoryArticle[];
	brandTerms: string[];
	fetchImpl?: typeof fetch;
}): Promise<DiscoveredCandidate[]> {
	const provider = selectSearchProvider(input.fetchImpl);
	if (!provider.configured) {
		const error = new Error(input.source === 'community'
			? 'Community research needs a configured search provider. Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY.'
			: 'Search research is not configured. Set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY.');
		(error as Error & { code: string }).code = 'search_provider_not_configured';
		throw error;
	}
	const query = input.source === 'community' ? `${input.topic} site:reddit.com` : input.topic;
	const hits = await provider.search(query, 5, { depth: 'basic' });
	return candidatesFromSearch({ ...input, hits });
}

function completeMetric(row: SearchConsoleQuery): row is SearchConsoleQuery & { impressions: number; clicks: number; ctr: number; position: number } {
	return row.impressions != null && row.clicks != null && row.ctr != null && row.position != null;
}

export async function discoverSearchConsole(input: {
	siteUrl: string;
	startDate: string;
	endDate: string;
	accessToken: string;
	fetchImpl?: typeof fetch;
}): Promise<DiscoveredCandidate[]> {
	const report = await fetchSearchConsoleReport({
		siteUrl: input.siteUrl,
		startDate: input.startDate,
		endDate: input.endDate,
		accessToken: input.accessToken,
		fetchImpl: input.fetchImpl,
		maxRows: 50,
	});
	return report.queries.filter(completeMetric).slice(0, 15).map((row) => {
		const page = report.queryPages.find((item) => item.query === row.query)?.page ?? null;
		return {
			title: row.query,
			audienceProblem: page ? `People searching this query are reaching ${page}.` : 'Search Console recorded this query for the property.',
			searchIntent: null,
			demandClass: 'observed' as const,
			discoverySource: 'search_console',
			naturalKey: key('search_console', row.query),
			evidence: [{
				sourceKind: 'search_console',
				url: page,
				excerpt: `${row.impressions} impressions, ${row.clicks} clicks, position ${row.position.toFixed(1)}. Property ${report.siteUrl}. Retrieved ${report.retrievedAt}.`,
				observedAt: report.retrievedAt,
				metrics: {
					impressions: row.impressions,
					clicks: row.clicks,
					ctr: row.ctr,
					position: row.position,
					startDate: input.startDate,
					endDate: input.endDate,
				},
			}],
			brandRelevance: 0.7,
			brandRationale: 'The query was returned for this brand’s Search Console property.',
			businessRelevance: row.impressions > 0 ? 0.6 : 0.2,
			businessRationale: 'Business relevance uses the measured impressions already stored. No additional volume was estimated.',
		};
	});
}

export function scoreCandidate(candidate: DiscoveredCandidate, inventory: InventoryArticle[]) {
	const overlap = assessOverlap({ title: candidate.title, intent: candidate.searchIntent }, inventory);
	const confidence = evidenceConfidence(candidate.demandClass, candidate.evidence.length, candidate.evidence.find((item) => item.metrics)?.metrics ?? null);
	const scored = scoreOpportunity({
		demandClass: candidate.demandClass,
		measured: candidate.evidence.find((item) => item.metrics)?.metrics ?? null,
		evidenceCount: candidate.evidence.length,
		brandRelevance: candidate.brandRelevance,
		brandRationale: candidate.brandRationale,
		uniqueValue: overlap.decision === 'create' ? 0.8 : overlap.decision === 'update' ? 0.35 : 0.05,
		uniqueRationale: overlap.rationale,
		businessRelevance: candidate.businessRelevance,
		businessRationale: candidate.businessRationale,
		researchFeasibility: candidate.evidence.length ? 0.7 : 0.2,
		researchRationale: candidate.evidence.length ? 'Source URLs or measured rows are stored, so article research has a starting point.' : 'No sources are stored yet.',
	});
	return { overlap, scored, confidence };
}
