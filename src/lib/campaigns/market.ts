import type { SearchHit } from '@/lib/research/search';
import { dedupeCandidates, problemKey } from './dedupe';
import type { DiscoveredCandidate } from './discovery';
import { assessOverlap, topicSimilarity } from './overlap';
import type { InventoryArticle } from './types';

const PRACTICAL = /\b(struggle|struggling|lose|losing|lost|forget|forgetting|inconsistent|continuity|canon|plot|track|hard to|can't|cannot|how do|how to|keep track|mix up|contradict|invent|hallucin)/i;

export function isAbstractPositioning(text: string): boolean {
	return /\b(what should|who decides|refuse to do|be able to trust|what is true in the book|between sessions)\b/i.test(text);
}

export function classifyIntent(text: string): 'informational' | 'commercial' | 'navigational' {
	if (/\b(pricing|buy|alternative|versus|\bvs\b|best tool|software)\b/i.test(text)) return 'commercial';
	if (/\b(login|download|official site)\b/i.test(text)) return 'navigational';
	return 'informational';
}

export function researchAreaQueries(areas: string[]): string[] {
	return [...new Set(areas.map((area) => area.trim()).filter((area) => area.length > 8))].slice(0, 6).map((area) => `${area} problems fiction writers`);
}

export function researchQueries(input: { brandName: string; problems: string[]; questions: string[]; pillars: string[] }): string[] {
	const brand = input.brandName.trim();
	const seeds = [...input.problems, ...input.questions, ...input.pillars];
	const practical: string[] = [];
	for (const seed of seeds) {
		if (isAbstractPositioning(seed)) continue;
		const cleaned = seed.replace(brand ? new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig') : /$^/, '').replace(/[?]/g, '').replace(/\s+/g, ' ').trim();
		if (cleaned.length < 12 || isAbstractPositioning(cleaned)) continue;
		practical.push(cleaned);
	}
	const unique = [...new Set(practical.map((item) => item.toLowerCase()))].map((key) => practical.find((item) => item.toLowerCase() === key)!);
	return unique.slice(0, 3).flatMap((seed, index) => index === 0 ? [`${seed} writers`, `${seed} site:reddit.com`] : [`${seed} writers`]);
}

export function contextOnly(hit: SearchHit): boolean {
	const text = `${hit.title ?? ''} ${hit.snippet ?? ''}`;
	return /\b(interview|talks with|in today'?s episode|opinion|annals of inquiry|views posted)\b/i.test(text)
		|| (/youtube\.com\/watch/i.test(hit.url) && /\b(views|posted:)\b/i.test(text));
}

export function practicalProblem(hit: SearchHit): string | null {
	const text = `${hit.title ?? ''} ${hit.snippet ?? ''}`.replace(/\s+/g, ' ').trim();
	if (!PRACTICAL.test(text) || isAbstractPositioning(text)) return null;
	const problem = (hit.snippet || hit.title || '').replace(/\s+/g, ' ').trim();
	return problem ? problem.slice(0, 220) : null;
}

export function brandFit(problem: string, capabilities: string[], approvedProblems: string[]): { value: number; rationale: string } {
	const named = capabilities.find((name) => name.trim().length > 3 && problem.toLowerCase().includes(name.toLowerCase()));
	if (named) return { value: 0.8, rationale: `The audience problem names the verified capability “${named}”.` };
	const related = approvedProblems.find((item) => !isAbstractPositioning(item) && topicSimilarity(problem, item) >= 0.45);
	if (related) return { value: 0.55, rationale: 'The problem matches an approved audience problem. Brand positioning was not used as the title.' };
	return { value: 0.2, rationale: 'No approved audience problem or verified capability matches this problem, so it is not validated for production.' };
}

export function candidatesFromMarket(input: {
	queries: Array<{ query: string; hits: SearchHit[] }>;
	inventory: InventoryArticle[];
	brandHost: string | null;
	retrievedAt: string;
	capabilities?: string[];
	approvedProblems?: string[];
}): { candidates: DiscoveredCandidate[]; merged: number } {
	const built: DiscoveredCandidate[] = [];
	for (const entry of input.queries) {
		const hits = entry.hits.filter((hit) => hit.url?.startsWith('https://'));
		const external = hits.filter((hit) => {
			try {
				return !input.brandHost || new URL(hit.url).host !== input.brandHost;
			} catch {
				return true;
			}
		});
		const practical = external.map((hit) => ({ hit, problem: practicalProblem(hit) })).filter((item): item is { hit: SearchHit; problem: string } => Boolean(item.problem));
		const demandHits = practical.filter((item) => !contextOnly(item.hit));
		if (!demandHits.length) continue;
		const problem = demandHits[0]!.problem;
		const angle = (demandHits[0]!.hit.title || problem).replace(/\s+/g, ' ').trim().slice(0, 140);
		const hosts = new Set(demandHits.map((item) => {
			try {
				return new URL(item.hit.url).host;
			} catch {
				return '';
			}
		}).filter(Boolean));
		const fit = brandFit(problem, input.capabilities ?? [], input.approvedProblems ?? []);
		const grounded = hosts.size >= 2 && fit.value >= 0.45;
		const overlap = assessOverlap({ title: angle, intent: classifyIntent(problem) }, input.inventory);
		const decision = !grounded ? 'research' : overlap.decision;
		built.push({
			title: angle,
			audienceProblem: problem,
			searchIntent: classifyIntent(`${problem} ${angle}`),
			demandClass: 'inferred',
			discoverySource: entry.query.includes('site:reddit.com') ? 'community' : 'search',
			naturalKey: `problem:${problemKey(problem)}`,
			grounded,
			forcedOverlap: {
				...overlap,
				decision,
				rationale: grounded
					? `${overlap.rationale} The audience problem is separate from the headline. No search volume was supplied.`
					: 'Retrieved pages do not establish a practical, brand-relevant reader need. This stays unvalidated.',
			},
			evidence: external.slice(0, 5).map((hit) => ({
				sourceKind: entry.query.includes('site:reddit.com') ? 'community' as const : 'search' as const,
				url: hit.url,
				excerpt: `${contextOnly(hit) ? 'Context, not demand. ' : ''}Retrieved ${input.retrievedAt}. ${hit.snippet?.slice(0, 400) ?? hit.title ?? ''}`.trim(),
				observedAt: hit.publishedAt ?? input.retrievedAt,
				metrics: null,
			})),
			brandRelevance: fit.value,
			brandRationale: fit.rationale,
			businessRelevance: grounded ? 0.45 : 0.2,
			businessRationale: `${hosts.size} external ${hosts.size === 1 ? 'site' : 'sites'} discussed this problem. No search volume was supplied.`,
		});
	}
	return dedupeCandidates(built);
}
