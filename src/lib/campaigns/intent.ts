import type { IntentRelation, InventoryArticle, OverlapCandidate } from './types';

const GENERIC = new Set(['novel', 'novels', 'writing', 'fiction', 'fictional', 'story', 'stories', 'book', 'books', 'author', 'authors', 'write', 'writer', 'writers', 'article', 'articles', 'using', 'with', 'from', 'your', 'into', 'when', 'what', 'this', 'that', 'across', 'without', 'about', 'their', 'them', 'have', 'does', 'how', 'for', 'and', 'the']);

export function contentTokens(value: string): string[] {
	return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !GENERIC.has(word));
}

function jaccard(left: string[], right: string[]): number {
	const a = new Set(left);
	const b = new Set(right);
	if (!a.size || !b.size) return 0;
	let shared = 0;
	for (const token of a) if (b.has(token)) shared += 1;
	return shared / new Set([...a, ...b]).size;
}

export function retrieveOverlapCandidates(title: string, inventory: InventoryArticle[]): OverlapCandidate[] {
	const needle = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2);
	return inventory
		.map((item) => {
			const haystack = `${item.title} ${item.keyword ?? ''}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2);
			const shared = needle.filter((word) => haystack.includes(word));
			const similarity = needle.length && haystack.length ? shared.length / Math.min(new Set(needle).size, new Set(haystack).size) : 0;
			return { articleId: item.id, title: item.title, similarity: Math.round(similarity * 100) / 100 };
		})
		.filter((item) => item.similarity >= 0.2)
		.sort((left, right) => right.similarity - left.similarity)
		.slice(0, 3);
}

export function compareSearchIntent(input: {
	title: string;
	audienceProblem?: string | null;
	article: InventoryArticle;
}): { relation: IntentRelation; overlap: number; rationale: string } {
	const question = contentTokens(`${input.title} ${input.audienceProblem ?? ''}`);
	const covered = contentTokens(`${input.article.title} ${input.article.topic} ${input.article.keyword ?? ''} ${input.article.intent ?? ''}`);
	const titleOverlap = jaccard(contentTokens(input.title), contentTokens(input.article.title));
	const overlap = Math.round(Math.max(jaccard(question, covered), titleOverlap) * 100) / 100;
	const shared = question.filter((token) => covered.includes(token));
	if (overlap >= 0.75) {
		return { relation: 'duplicate_intent', overlap, rationale: `The reader question matches “${input.article.title}”. Shared intent: ${shared.join(', ') || 'the same question'}. A second article would cannibalise that page.` };
	}
	if (overlap >= 0.5) {
		return { relation: 'substantially_overlapping', overlap, rationale: `“${input.article.title}” already answers most of this question. Shared intent: ${shared.join(', ')}. A new article would compete with it.` };
	}
	if (overlap > 0 || shared.length) {
		return { relation: 'related_but_distinct', overlap, rationale: `“${input.article.title}” is in the same writing cluster, but the reader question is different. Shared words: ${shared.join(', ') || 'domain terms only'}. This can sit beside that article.` };
	}
	return { relation: 'related_but_distinct', overlap, rationale: `“${input.article.title}” is in the same writing cluster, but it answers a different reader question. This can sit beside that article.` };
}
