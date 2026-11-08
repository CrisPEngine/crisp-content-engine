import { describe, expect, it } from 'vitest';
import { generateArticleMetadata, sanitizePlainMetadata } from '@/lib/articles/seoMetadata';
import type { ArticleRecord } from '@/lib/articles/types';

function stubArticle(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
	return {
		id: 'test',
		title: 'How to Write a Novel',
		topic: 'How to Write a Novel',
		body: '## Plan your story\n\nStart with a premise readers care about.\n\n## Draft daily\n\nShort sessions beat occasional marathons.',
		slug: '',
		excerpt: '',
		seo: { seoTitle: '', metaDescription: '', excerpt: '', slug: '' },
		workspace: { seoEdited: {} },
		...overrides,
	} as ArticleRecord;
}

describe('seoMetadata', () => {
	it('strips markdown from generated metadata', () => {
		const generated = generateArticleMetadata(stubArticle());
		expect(generated.metaDescription).not.toMatch(/##|```/);
		expect(generated.excerpt).not.toMatch(/##|```/);
		expect(generated.metaDescription).toContain('premise');
		expect(sanitizePlainMetadata('## Heading\n\n```code```', 160)).not.toMatch(/##|```/);
	});

	it('keeps excerpt and meta description distinct from a raw heading slice', () => {
		const generated = generateArticleMetadata(stubArticle());
		expect(generated.metaDescription).not.toBe('## Plan your story');
		expect(generated.excerpt).not.toBe(generated.metaDescription);
	});
});
