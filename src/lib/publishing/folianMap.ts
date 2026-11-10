import type { ArticleRecord } from '@/lib/articles/types';
import { sourcesForPublication } from '@/lib/articles/publicSources';
import { parseSections } from '@/lib/articles/structure';
import { assertDestinationCategory, type DestinationTaxonomy } from './destinationTaxonomy';
import { folianTaxonomyFallback } from './folian/taxonomyFallback';

type FolianDraftPayload = Record<string, unknown>;

/** Blocks come from the saved body so manual edits and applied revisions reach the CMS. */
function sectionBlocks(article: ArticleRecord) {
	return parseSections(article.body).map((section) => ({
		type: 'richText',
		markdown: section.heading ? `## ${section.heading}\n\n${section.body}` : section.body,
	}));
}

function relatedToolSlugs(article: ArticleRecord, taxonomy: { tools: Array<{ slug: string; linkWhenTopicMatches?: string }> }): string[] {
	const haystack = `${article.topic} ${article.body}`;
	return taxonomy.tools
		.filter((tool) => tool.linkWhenTopicMatches && new RegExp(tool.linkWhenTopicMatches, 'i').test(haystack))
		.map((tool) => tool.slug);
}

export function mapArticleRecordToFolianDraft(
	article: ArticleRecord,
	options: {
		externalId: string;
		baseRevision?: number;
		mode?: 'update' | 'proposal';
		heroMediaId?: string;
		ogMediaId?: string;
		taxonomy?: DestinationTaxonomy;
	},
): FolianDraftPayload {
	const taxonomy = options.taxonomy ?? folianTaxonomyFallback;
	const categoryId = article.categories[0] || taxonomy.categories[0]?.id || '';
	const requestedType = article.workspace?.contentType || (article.tags.includes('pillar') ? 'pillar' : 'guide');
	const contentType = taxonomy.contentTypes.includes(requestedType) ? requestedType : taxonomy.contentTypes[0] ?? requestedType;
	return {
		schemaVersion: 1,
		externalId: options.externalId,
		baseRevision: options.baseRevision,
		mode: options.mode ?? 'update',
		title: article.title,
		slug: article.slug,
		dek: article.excerpt,
		category: assertDestinationCategory(taxonomy, categoryId),
		tags: article.tags,
		contentType,
		seoTitle: article.seo.seoTitle,
		seoDescription: article.seo.metaDescription,
		relatedArticleSlugs: article.internalLinkOpportunities.filter((slug) => !slug.startsWith('/tools/')),
		relatedToolSlugs: relatedToolSlugs(article, taxonomy),
		sources: sourcesForPublication(article),
		heroMediaId: options.heroMediaId,
		ogMediaId: options.ogMediaId,
		featured: article.tags.includes('featured'),
		pillar: article.tags.includes('pillar'),
		reviewRequired: article.approval.status === 'pending',
		body: sectionBlocks(article),
	};
}
