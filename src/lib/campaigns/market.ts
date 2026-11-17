import type { SearchHit } from '@/lib/research/search';
import type { DiscoveredCandidate } from './discovery';
import { assessOverlap } from './overlap';
import type { InventoryArticle } from './types';

export function marketQueries(input: {
	brandName: string;
	themes: string[];
	problems: string[];
	pillars: string[];
	questions: string[];
}): string[] {
	const seeds = [...input.questions, ...input.problems, ...input.themes, ...input.pillars]
		.map((item) => item.trim())
		.filter((item) => item.length > 8 && item.toLowerCase() !== input.brandName.toLowerCase());
	const unique = [...new Set(seeds.map((item) => item.toLowerCase()))].map((key) => seeds.find((item) => item.toLowerCase() === key)!);
	return unique.slice(0, 4).flatMap((seed, index) => index === 0 ? [seed, `${seed} site:reddit.com`] : [seed]);
}

export function candidatesFromMarket(input: {
	queries: Array<{ query: string; hits: SearchHit[] }>;
	inventory: InventoryArticle[];
	brandHost: string | null;
	retrievedAt: string;
}): DiscoveredCandidate[] {
	const candidates: DiscoveredCandidate[] = [];
	for (const entry of input.queries) {
		const hits = entry.hits.filter((hit) => hit.url?.startsWith('https://'));
		if (!hits.length) continue;
		const outside = hits.filter((hit) => {
			try {
				return !input.brandHost || new URL(hit.url).host !== input.brandHost;
			} catch {
				return true;
			}
		});
		const overlap = assessOverlap({ title: entry.query }, input.inventory);
		const ownOnly = outside.length === 0;
		const decision = ownOnly ? 'reject' : overlap.decision === 'reject' ? 'reject' : overlap.decision === 'update' ? 'update' : 'create';
		candidates.push({
			title: entry.query.replace(/ site:reddit.com$/i, '').trim(),
			audienceProblem: hits[0]?.snippet?.slice(0, 280) || entry.query,
			searchIntent: 'informational',
			demandClass: 'inferred',
			discoverySource: entry.query.includes('site:reddit.com') ? 'community' : 'search',
			naturalKey: `market:${entry.query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`,
			forcedOverlap: {
				...overlap,
				decision,
				rationale: ownOnly
					? 'The only retrieved pages are on the brand’s own site. That is not an external content gap.'
					: `${overlap.rationale} Demand is inferred from public pages. No search volume was supplied.`,
			},
			evidence: hits.slice(0, 5).map((hit) => ({
				sourceKind: entry.query.includes('site:reddit.com') ? 'community' : 'search',
				url: hit.url,
				excerpt: hit.snippet?.slice(0, 500) ?? hit.title ?? null,
				observedAt: hit.publishedAt ?? input.retrievedAt,
				metrics: null,
			})),
			brandRelevance: 0.6,
			brandRationale: 'The query came from approved strategy, themes, or audience problems. It was not taken from an existing article title.',
			businessRelevance: decision === 'create' ? 0.55 : 0.35,
			businessRationale: `${outside.length} external ${outside.length === 1 ? 'page was' : 'pages were'} retrieved. No keyword volume was supplied.`,
		});
	}
	return candidates;
}
