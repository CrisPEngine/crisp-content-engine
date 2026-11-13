import { excerptFrom, plainText } from './structure';
import type { ArticleRecord } from './types';

export type ArticleSeoEdited = {
	seoTitle?: boolean;
	metaDescription?: boolean;
	excerpt?: boolean;
	slug?: boolean;
};

export type SeoFieldIssue = { field: keyof ArticleSeoEdited | 'metaDescription'; message: string };

const MARKDOWN_SIGNAL = /(^|\n)\s*#{1,6}\s+|```|^\s*[-*+]\s+/m;

export function slugifyTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/['']/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);
}

/** Strips markdown so SEO fields stay plain text. */
export function sanitizePlainMetadata(value: string, maxLen: number): string {
	const cleaned = plainText(value.replace(/\r\n/g, '\n')).replace(/\s+/g, ' ').trim();
	if (!cleaned) return '';
	return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1).trim()}…`;
}

export function metadataFieldIssues(article: ArticleRecord): SeoFieldIssue[] {
	const issues: SeoFieldIssue[] = [];
	const check = (field: SeoFieldIssue['field'], value: string, max: number) => {
		const trimmed = value.trim();
		if (!trimmed) issues.push({ field, message: `${field} is empty.` });
		if (MARKDOWN_SIGNAL.test(trimmed) || trimmed.includes('##')) {
			issues.push({ field, message: `${field} must be plain text with no Markdown headings or code fences.` });
		}
		if (trimmed.length > max) issues.push({ field, message: `${field} is ${trimmed.length} characters (limit ${max}).` });
	};
	check('seoTitle', article.seo.seoTitle || article.title, 70);
	check('metaDescription', article.seo.metaDescription, 160);
	check('excerpt', article.excerpt || article.seo.excerpt, 320);
	if (!article.slug.trim()) issues.push({ field: 'slug', message: 'Slug is empty.' });
	return issues;
}

function summarySentences(body: string, count: number): string {
	const text = plainText(body);
	const sentences = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
	return sentences.slice(0, count).join(' ').trim();
}

/** Builds SEO fields from the article title and body without copying raw Markdown. */
export function generateArticleMetadata(article: ArticleRecord): {
	seoTitle: string;
	metaDescription: string;
	excerpt: string;
	slug: string;
} {
	const title = (article.title || article.topic).trim();
	const seoTitle = sanitizePlainMetadata(title, 70);
	const slug = article.slug?.trim() ? slugifyTitle(article.slug) : slugifyTitle(title);
	const metaDescription = sanitizePlainMetadata(summarySentences(article.body, 2) || excerptFrom(article.body, 120), 155);
	const excerpt = sanitizePlainMetadata(excerptFrom(article.body, 280), 320);
	return { seoTitle, metaDescription, excerpt, slug };
}

export function applyGeneratedMetadata(
	article: ArticleRecord,
	generated: ReturnType<typeof generateArticleMetadata>,
	options?: { overwriteEdited?: boolean },
): void {
	const edited = article.workspace?.seoEdited ?? {};
	const allow = (field: keyof ArticleSeoEdited) => options?.overwriteEdited || !edited[field];
	if (allow('seoTitle')) article.seo.seoTitle = generated.seoTitle;
	if (allow('metaDescription')) article.seo.metaDescription = generated.metaDescription;
	if (allow('excerpt')) {
		article.excerpt = generated.excerpt;
		article.seo.excerpt = generated.excerpt;
	}
	if (allow('slug')) {
		article.slug = generated.slug;
		article.seo.slug = generated.slug;
	}
}

export async function generateArticleMetadataWithAi(
	article: ArticleRecord,
	ai: { completeJson<T>(role: string, messages: Array<{ role: string; content: string }>, feature: string, userId?: string): Promise<{ data: T; model?: string | null }> },
	ownerUserId: string,
): Promise<{ metadata: ReturnType<typeof generateArticleMetadata>; model: string | null }> {
	if (process.env.VITEST === 'true') {
		return { metadata: generateArticleMetadata(article), model: 'stub' };
	}
	const { loadResolvedIntelligence } = await import('@/lib/intelligence/knowledge/load');
	const { getIntelligenceStore } = await import('@/lib/intelligence/actions');
	const brain =
		(await getIntelligenceStore().getBrandBrainById(ownerUserId, article.brandId)) ??
		(await getIntelligenceStore().getBrandBrain(ownerUserId, article.brandId));
	const intelligence = brain ? await loadResolvedIntelligence(ownerUserId, brain, `${article.title} ${article.topic}`, 'seo') : null;
	const completion = await ai.completeJson<{ seoTitle?: string; metaDescription?: string; excerpt?: string; slug?: string }>(
		'REVIEW',
		[
			{
				role: 'system',
				content:
					'Write plain-text SEO metadata for a website article. Return JSON with seoTitle (under 70 chars), metaDescription (under 155 chars, no markdown), excerpt (under 280 chars, editorial intro), slug (lowercase hyphenated). Do not copy markdown headings from the body.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					title: article.title,
					topic: article.topic,
					searchIntent: article.searchIntent,
					primaryKeyword: article.primaryKeyword,
					targetWords: article.targetWords,
					bodyPreview: plainText(article.body).slice(0, 4000),
					productKnowledge: intelligence?.prompt,
				}),
			},
		],
		'article_seo_metadata',
		ownerUserId,
	);
	const data = completion.data ?? {};
	const fallback = generateArticleMetadata(article);
	return {
		metadata: {
			seoTitle: sanitizePlainMetadata(data.seoTitle || fallback.seoTitle, 70),
			metaDescription: sanitizePlainMetadata(data.metaDescription || fallback.metaDescription, 155),
			excerpt: sanitizePlainMetadata(data.excerpt || fallback.excerpt, 320),
			slug: slugifyTitle(data.slug || fallback.slug),
		},
		model: completion.model ?? null,
	};
}
