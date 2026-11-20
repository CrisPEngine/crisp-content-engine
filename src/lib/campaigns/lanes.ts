import type { ContentOpportunity } from './types';

const STOP = new Set(['with', 'from', 'that', 'this', 'your', 'into', 'without', 'when', 'what', 'how', 'for', 'and', 'the']);

export function intentTokens(value: string): Set<string> {
	return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !STOP.has(word)));
}

export function sameSearchIntent(left: string, right: string): boolean {
	const a = intentTokens(left);
	const b = intentTokens(right);
	if (!a.size || !b.size) return false;
	let shared = 0;
	for (const token of a) if (b.has(token)) shared += 1;
	return shared / Math.min(a.size, b.size) >= 0.6;
}

export function selectDistinctOpportunities(opportunities: ContentOpportunity[], limit = 5): ContentOpportunity[] {
	const ranked = opportunities
		.filter((item) => item.recommendedAction === 'create' && !item.scoreDetail.promotionBlocked && item.demandClass !== 'unvalidated' && item.evidenceConfidence !== 'none' && item.evidenceConfidence !== 'low' && item.evidence.length > 0 && item.status !== 'rejected' && item.status !== 'archived' && item.status !== 'in_production')
		.sort((left, right) => {
			const lane = (item: ContentOpportunity) => item.scoreDetail.lane === 'new_topic' ? 2 : item.scoreDetail.lane === 'existing_query' ? 1 : 0;
			return lane(right) - lane(left) || right.score - left.score;
		});
	const chosen: ContentOpportunity[] = [];
	for (const item of ranked) {
		if (chosen.some((existing) => sameSearchIntent(existing.title, item.title) || sameSearchIntent(existing.audienceProblem, item.audienceProblem))) continue;
		chosen.push(item);
		if (chosen.length >= limit) break;
	}
	return chosen;
}

export function selectionRationale(item: ContentOpportunity): string {
	const lane = item.scoreDetail.lane === 'refresh'
		? 'Refresh work stays on the existing page.'
		: item.scoreDetail.lane === 'existing_query'
			? 'Measured search evidence is stored. Volume was not estimated.'
			: 'No search volume is claimed. The topic is inferred from sources and the approved pillars.';
	return `${lane} ${item.overlap.rationale} Evidence confidence is ${item.evidenceConfidence}.`;
}
