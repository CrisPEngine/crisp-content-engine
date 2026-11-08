import { describe, expect, it } from 'vitest';
import { classifyArticleForDestination } from '../classifyForDestination';
import { folianTaxonomyFallback } from '../folian/taxonomyFallback';
import { runDeterministicArticleReview } from '@/lib/articles/editorialReview';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';

const stubAi: IntelligenceAi = {
	async completeJson<T>() {
		return { data: {} as T, model: 'stub' };
	},
};

describe('destination taxonomy and review', () => {
	it('classifies the novel cornerstone into Folian writing-a-book', async () => {
		const result = await classifyArticleForDestination({
			ai: stubAi,
			ownerUserId: 'owner',
			topic: 'How to Write a Novel: From Idea to First Draft',
			searchIntent: 'informational',
			taxonomy: folianTaxonomyFallback,
		});
		expect(result.categoryId).toBe('writing-a-book');
		expect(result.pillar).toBe(true);
		expect(result.toolSlugs).toContain('word-count-planner');
	});

	it('explains a length deviation without treating the target as a hard gate', () => {
		const review = runDeterministicArticleReview({
			body: 'A short note.',
			wordCount: 3,
			targetWords: 3000,
			categoryId: 'writing-a-book',
			taxonomy: folianTaxonomyFallback,
			sourceCount: 0,
			claimsExternalResearch: false,
			toolSlugs: [],
		});
		const length = review.findings.find((finding) => finding.code === 'too_short');
		expect(length?.severity).toBe('major');
		expect(length?.instruction).toContain('3 words against a target of 3,000');
	});

	it('rejects an unknown category as critical', () => {
		const review = runDeterministicArticleReview({
			body: 'A complete paragraph.',
			wordCount: 3,
			targetWords: 3,
			categoryId: 'not-a-category',
			taxonomy: folianTaxonomyFallback,
			sourceCount: 0,
			claimsExternalResearch: false,
			toolSlugs: [],
		});
		expect(review.ready).toBe(false);
		expect(review.findings.find((finding) => finding.code === 'unknown_category')?.rejectable).toBe(false);
	});
});
