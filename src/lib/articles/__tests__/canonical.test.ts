import { describe, expect, it } from 'vitest';
import { parseCanonicalBlocks, toCanonicalArticle } from '../canonical';
import { validateForDestination, PAYLOAD_CONTENT_CAPABILITIES } from '@/lib/destinations/contentCapabilities';
import type { ArticleRecord } from '../types';

describe('canonical article model', () => {
	it('parses tables, emphasis and lists without flattening', () => {
		const blocks = parseCanonicalBlocks('## Title\n\nA **bold** and *italic* line.\n\n- One\n- Two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
		expect(blocks.some((block) => block.type === 'heading')).toBe(true);
		expect(blocks.some((block) => block.type === 'list')).toBe(true);
		expect(blocks.some((block) => block.type === 'table')).toBe(true);
	});

	it('flags a missing category against Payload capabilities', () => {
		const article = {
			title: 'Test',
			slug: 'test',
			excerpt: 'Dek',
			body: '## One\n\nBody.',
			seo: { seoTitle: 'Test', metaDescription: 'Desc', excerpt: 'Dek', canonical: null, primaryKeyword: null, title: 'Test', slug: 'test', secondaryTopics: [] },
			searchIntent: 'informational',
			categories: [],
			tags: [],
			author: null,
			primaryKeyword: null,
			workspace: { contentType: 'guide', brief: { cta: '' }, media: { heroUrl: null, heroAlt: '' } },
			wordCount: 10,
		} as unknown as ArticleRecord;
		const canonical = toCanonicalArticle(article, { destination: 'folian', schemaVersion: 1, categoryCreationPolicy: 'closed', categories: [{ id: 'writing-a-book', name: 'Writing a Book', description: '' }], contentTypes: ['guide'], tags: { policy: 'open' }, tools: [] });
		const issues = validateForDestination(canonical, PAYLOAD_CONTENT_CAPABILITIES);
		expect(issues.some((issue) => issue.code === 'category_missing')).toBe(true);
	});
});
