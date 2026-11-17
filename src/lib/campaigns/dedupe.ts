import type { DiscoveredCandidate } from './discovery';
import { tokens, topicSimilarity } from './overlap';

export function sameOpportunity(left: string, right: string): boolean {
	return topicSimilarity(left, right) >= 0.72;
}

export function problemKey(text: string): string {
	return [...tokens(text)].sort().join(' ');
}

export function dedupeCandidates(candidates: DiscoveredCandidate[]): { candidates: DiscoveredCandidate[]; merged: number } {
	const kept: DiscoveredCandidate[] = [];
	let merged = 0;
	for (const candidate of candidates) {
		const match = kept.find((item) => sameOpportunity(item.audienceProblem, candidate.audienceProblem) || sameOpportunity(item.title, candidate.title));
		if (!match) {
			kept.push({ ...candidate, evidence: [...candidate.evidence] });
			continue;
		}
		merged += 1;
		const seen = new Set(match.evidence.map((item) => `${item.sourceKind}:${item.url ?? ''}`));
		for (const item of candidate.evidence) {
			const key = `${item.sourceKind}:${item.url ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			match.evidence.push(item);
		}
		const sources = new Set([match.discoverySource, candidate.discoverySource]);
		match.discoverySource = [...sources].join('+');
		match.naturalKey = `problem:${problemKey(match.audienceProblem)}`;
		match.businessRationale = `${match.evidence.length} supporting sources were merged into one opportunity. ${match.businessRationale}`;
	}
	return { candidates: kept, merged };
}
