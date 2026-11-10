import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@/lib/articles/types';
import { mapArticleRecordToFolianDraft } from '../folianMap';

function minimalArticle(): ArticleRecord {
	return {
		title: 'How to Write a Novel',
		topic: 'novel writing',
		excerpt: 'A dek.',
		slug: 'how-to-write-a-novel',
		body: '## One\n\nParagraph.',
		categories: ['writing-a-book'],
		tags: [],
		searchIntent: 'informational',
		internalLinkOpportunities: [],
		approval: { required: false, approver: 'human', status: 'approved' },
		seo: {
			title: 'Title',
			seoTitle: 'SEO title',
			slug: 'how-to-write-a-novel',
			excerpt: 'A dek.',
			metaDescription: 'Meta only.',
			canonical: null,
			primaryKeyword: 'novel',
			secondaryTopics: [],
		},
		research: { sources: [], claims: [], gaps: [] },
		workspace: { research: { status: 'approved', version: 1, sources: [], items: [], notes: '', expertise: '', gaps: [], updates: [], approved: null, updatedAt: null } },
	} as unknown as ArticleRecord;
}

describe('mapArticleRecordToFolianDraft', () => {
	it.each(['update', 'proposal', 'correction'] as const)('passes %s mode through to the Payload body', (mode) => {
		const payload = mapArticleRecordToFolianDraft(minimalArticle(), {
			externalId: 'cce_pillar_novel-first-draft',
			baseRevision: 2,
			mode,
		});
		expect(payload.mode).toBe(mode);
		expect(payload.externalId).toBe('cce_pillar_novel-first-draft');
		expect(payload.baseRevision).toBe(2);
		expect(payload.searchIntent).toBeUndefined();
		expect(payload.seoDescription).toBe('Meta only.');
	});

	it('defaults mode to update', () => {
		const payload = mapArticleRecordToFolianDraft(minimalArticle(), { externalId: 'x' });
		expect(payload.mode).toBe('update');
	});

	it('does not request review when the article is approved', () => {
		const payload = mapArticleRecordToFolianDraft(minimalArticle(), { externalId: 'x', mode: 'correction' });
		expect(payload.reviewRequired).toBe(false);
	});
});
