import { describe, expect, it } from 'vitest';
import { normaliseExternalId, suggestCmsExternalId, articleOwnsExternalId } from '@/lib/articles/meta';
import type { ArticleRecord } from '@/lib/articles/types';

describe('CMS identity', () => {
	it('suggests a unique external ID from the article slug without Folian hard-coding', () => {
		const id = suggestCmsExternalId({
			articleId: '08776e21-147f-4353-8ad5-10249b8c86c9',
			slug: 'how-to-start-writing-a-book',
		});
		expect(id).toBe('cce_how-to-start-writing-a-book');
		expect(id).not.toBe('cce_pillar_novel-first-draft');
		expect(id).toMatch(/^cce_/);
	});

	it('disambiguates when two articles would share a slug-based ID', () => {
		const a = suggestCmsExternalId({ articleId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', slug: 'shared-slug' });
		const b = suggestCmsExternalId({ articleId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', slug: 'shared-slug', disambiguate: true });
		expect(a).toBe('cce_shared-slug');
		expect(b).toBe('cce_shared-slug_bbbbbbbbbb');
		expect(a).not.toBe(b);
	});

	it('never returns the Article 1 pillar ID for Article 2', () => {
		const article2 = suggestCmsExternalId({
			articleId: '08776e21-147f-4353-8ad5-10249b8c86c9',
			slug: 'how-to-start-writing-a-book-step-by-step-guide-for-beginners',
		});
		expect(article2).not.toEqual('cce_pillar_novel-first-draft');
		expect(normaliseExternalId('cce_pillar_novel-first-draft')).toBe('cce_pillar_novel-first-draft');
	});

	it('detects ownership of an external ID for the linked article only', () => {
		const article = {
			id: '08776e21-147f-4353-8ad5-10249b8c86c9',
			workspace: { externalId: 'cce_how-to-start-writing-a-book', cms: { externalId: 'cce_how-to-start-writing-a-book' } },
		} as ArticleRecord;
		expect(articleOwnsExternalId(article, 'cce_how-to-start-writing-a-book')).toBe(true);
		expect(articleOwnsExternalId(article, 'cce_pillar_novel-first-draft')).toBe(false);
	});
});
