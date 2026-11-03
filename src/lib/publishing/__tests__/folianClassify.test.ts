import { describe, expect, it } from 'vitest';
import { assertFolianCategory, classifyFolianTopic } from '../folianClassify';
import { reviewArticleDraft } from '@/lib/articles/editorialReview';

describe('Folian classification and editorial review', () => {
	it('classifies the novel cornerstone as a writing-a-book pillar', () => {
		const result = classifyFolianTopic('How to Write a Novel: From Idea to First Draft', 'informational');
		expect(result.category).toBe('writing-a-book');
		expect(result.pillar).toBe(true);
		expect(result.toolSlugs).toContain('word-count-planner');
	});

	it('rejects an unknown category', () => {
		expect(() => assertFolianCategory('fiction')).toThrow(/Unknown Folian category/);
	});

	it('does not pass a short draft that exhausted no review cycles', () => {
		const review = reviewArticleDraft({
			body: 'A short note.',
			wordCount: 3,
			targetWords: 3000,
			category: 'writing-a-book',
			allowedCategories: ['writing-a-book'],
			sourceCount: 0,
			claimsExternalResearch: false,
			toolSlugs: [],
		});
		expect(review.ready).toBe(false);
		expect(review.findings.some((finding) => finding.code === 'too_short' && finding.severity === 'critical')).toBe(true);
	});
});
