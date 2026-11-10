import type { BrandBrain } from '@/lib/intelligence/types';
import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import { splitLines } from './meta';
import type { InventoryItem, QualityContext, RelatedArticle } from './quality';
import { normaliseUrl } from './researchPackage';
import type { ArticleRecord } from './types';

function originOf(url: string | undefined | null): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

function publishedUrl(article: ArticleRecord, origin: string | null): string | null {
	if (article.publication?.url) return article.publication.url;
	if (article.status === 'published' && origin && article.slug) return `${origin}/articles/${article.slug}`;
	return null;
}

/**
 * What the quality checks need to know about the rest of the site: its hosts, the pages CCE knows exist, the
 * published articles this one could overlap with, and the names whose repetition reads as promotion.
 */
export function buildQualityContext(input: {
	article: ArticleRecord;
	siblings: ArticleRecord[];
	brain: BrandBrain;
	taxonomy: DestinationTaxonomy | null;
}): Omit<QualityContext, 'body' | 'wordCount'> {
	const { article, brain, taxonomy } = input;
	const origin = originOf(brain.identity.website);
	const siteHosts = origin ? [new URL(origin).hostname.replace(/^www\./, '')] : [];
	const others = input.siblings.filter((item) => item.id !== article.id && item.brandId === article.brandId);
	const inventory: InventoryItem[] = [];
	for (const other of others) {
		const url = publishedUrl(other, origin);
		if (url) inventory.push({ url, title: other.title });
	}
	if (origin) {
		for (const tool of taxonomy?.tools ?? []) if (tool.routePath) inventory.push({ url: `${origin}${tool.routePath}`, title: tool.label });
	}
	for (const link of splitLines(article.workspace?.brief?.requiredLinks)) if (/^https?:\/\//.test(link)) inventory.push({ url: link });
	const named = splitLines(article.workspace?.brief?.differentiateFrom).map((line) => line.toLowerCase());
	const related: RelatedArticle[] = others
		.filter((other) => {
			const url = publishedUrl(other, origin);
			const mentioned = named.some((line) => line.includes(other.title.toLowerCase()) || (url && normaliseUrl(line) === normaliseUrl(url)));
			return mentioned || other.status === 'published';
		})
		.map((other) => ({ title: other.title, url: publishedUrl(other, origin), primaryKeyword: other.primaryKeyword ?? null, body: other.body }));
	return {
		title: article.title,
		primaryKeyword: article.primaryKeyword ?? null,
		siteHosts,
		promotedNames: [brain.identity.name, ...(taxonomy?.tools ?? []).map((tool) => tool.label)].filter(Boolean),
		inventory,
		related,
		contentType: article.workspace?.contentType,
	};
}
