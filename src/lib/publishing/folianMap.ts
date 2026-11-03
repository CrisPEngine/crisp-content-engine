import type { ArticleRecord } from '@/lib/articles/types';
import { assertFolianCategory } from './folianClassify';

type FolianDraftPayload = Record<string, unknown>;

function sectionBlocks(article: ArticleRecord) {
	return article.sections.map((section) => ({
		type: 'richText',
		markdown: `## ${section.heading}\n\n${section.body}`,
	}));
}

export function mapArticleRecordToFolianDraft(
	article: ArticleRecord,
	options: { externalId: string; baseRevision?: number; mode?: 'update' | 'proposal'; heroMediaId?: string; ogMediaId?: string },
): FolianDraftPayload {
	return {
		schemaVersion: 1,
		externalId: options.externalId,
		baseRevision: options.baseRevision,
		mode: options.mode ?? 'update',
		title: article.title,
		slug: article.slug,
		dek: article.excerpt,
		category: assertFolianCategory(article.categories[0] ?? 'writing-a-book'),
		tags: article.tags,
		contentType: article.tags.includes('pillar') ? 'pillar' : 'guide',
		searchIntent: article.searchIntent,
		seoTitle: article.seo.seoTitle,
		seoDescription: article.seo.metaDescription,
		relatedArticleSlugs: article.internalLinkOpportunities,
		relatedToolSlugs: article.tags.some((tag) => /novel|draft|word/i.test(tag)) || article.categories.includes('writing-a-book')
			? ['word-count-planner']
			: [],
		sources: article.research.sources
			.filter((source) => source.url)
			.map((source) => ({
				title: source.label,
				url: source.url as string,
				publisher: source.kind,
				accessedAt: source.retrievedAt,
			})),
		heroMediaId: options.heroMediaId,
		ogMediaId: options.ogMediaId,
		featured: article.tags.includes('featured'),
		pillar: article.tags.includes('pillar'),
		reviewRequired: true,
		body: sectionBlocks(article),
	};
}
