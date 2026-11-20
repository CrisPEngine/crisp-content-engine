import { compareSearchIntent, retrieveOverlapCandidates } from './intent';
import type { InventoryArticle, OpportunityAction, OverlapAssessment } from './types';

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'with', 'how', 'your', 'without', 'from']);

export function tokens(value: string): Set<string> {
	return new Set(
		value
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((word) => word.length > 2 && !STOP.has(word)),
	);
}

export function topicSimilarity(leftText: string, rightText: string): number {
	return overlapRatio(tokens(leftText), tokens(rightText));
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared += 1;
	return shared / Math.min(left.size, right.size);
}

export function assessOverlap(candidate: { title: string; intent?: string | null; keyword?: string | null; audienceProblem?: string | null }, inventory: InventoryArticle[]): OverlapAssessment {
	const candidates = retrieveOverlapCandidates(`${candidate.title} ${candidate.keyword ?? ''}`, inventory);
	if (!candidates.length) {
		return {
			decision: 'create',
			overlap: 0,
			matchedArticleId: null,
			matchedTitle: null,
			intentRelation: 'distinct',
			candidates: [],
			rationale: 'No existing article shares enough of this topic and intent to treat it as a duplicate.',
		};
	}
	const compared = candidates.map((item) => {
		const article = inventory.find((entry) => entry.id === item.articleId);
		return article ? { item, article, comparison: compareSearchIntent({ title: candidate.title, audienceProblem: candidate.audienceProblem ?? candidate.intent, article }) } : null;
	}).filter((item): item is NonNullable<typeof item> => Boolean(item));
	const rank = { duplicate_intent: 3, substantially_overlapping: 2, related_but_distinct: 1, distinct: 0 };
	compared.sort((left, right) => rank[right.comparison.relation] - rank[left.comparison.relation] || right.comparison.overlap - left.comparison.overlap);
	const best = compared[0];
	if (!best || best.comparison.relation === 'distinct' || best.comparison.relation === 'related_but_distinct') {
		return {
			decision: 'create',
			overlap: best?.comparison.overlap ?? 0,
			matchedArticleId: best?.article.id ?? null,
			matchedTitle: best?.article.title ?? null,
			intentRelation: best?.comparison.relation ?? 'distinct',
			candidates,
			rationale: best?.comparison.rationale ?? 'No existing article answers this reader question.',
		};
	}
	return {
		decision: best.comparison.relation === 'duplicate_intent' ? 'reject' : 'update',
		overlap: best.comparison.overlap,
		matchedArticleId: best.article.id,
		matchedTitle: best.article.title,
		intentRelation: best.comparison.relation,
		candidates,
		rationale: best.comparison.rationale,
	};
}

export function actionFor(overlap: OverlapAssessment, promotionBlocked: boolean): OpportunityAction {
	if (promotionBlocked && overlap.decision !== 'reject') return 'research';
	return overlap.decision;
}
