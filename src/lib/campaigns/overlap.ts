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

function overlapRatio(left: Set<string>, right: Set<string>): number {
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared += 1;
	return shared / Math.min(left.size, right.size);
}

export function assessOverlap(candidate: { title: string; intent?: string | null; keyword?: string | null }, inventory: InventoryArticle[]): OverlapAssessment {
	const needle = tokens(`${candidate.title} ${candidate.intent ?? ''} ${candidate.keyword ?? ''}`);
	let best: { item: InventoryArticle; ratio: number } | null = null;
	for (const item of inventory) {
		const ratio = overlapRatio(needle, tokens(`${item.title} ${item.topic} ${item.keyword ?? ''} ${item.intent ?? ''}`));
		if (!best || ratio > best.ratio) best = { item, ratio };
	}
	if (!best || best.ratio < 0.45) {
		return {
			decision: 'create',
			overlap: best?.ratio ?? 0,
			matchedArticleId: null,
			matchedTitle: null,
			rationale: 'No existing article shares enough of this topic and intent to treat it as a duplicate.',
		};
	}
	const published = best.item.status === 'published';
	if (best.ratio >= 0.8) {
		return {
			decision: 'reject',
			overlap: Math.round(best.ratio * 100) / 100,
			matchedArticleId: best.item.id,
			matchedTitle: best.item.title,
			rationale: `This is substantially the same query as “${best.item.title}”. A new article would compete with it. The existing article was not changed.`,
		};
	}
	return {
		decision: 'update',
		overlap: Math.round(best.ratio * 100) / 100,
		matchedArticleId: best.item.id,
		matchedTitle: best.item.title,
		rationale: published
			? `“${best.item.title}” already covers part of this intent. Update that article instead of publishing a second one. Nothing was overwritten.`
			: `“${best.item.title}” overlaps this intent. Extend that draft instead of starting a duplicate. Nothing was overwritten.`,
	};
}

export function actionFor(overlap: OverlapAssessment, promotionBlocked: boolean): OpportunityAction {
	if (promotionBlocked && overlap.decision !== 'reject') return 'research';
	return overlap.decision;
}
