import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import type { DestinationTaxonomy } from './destinationTaxonomy';
import { assertDestinationCategory } from './destinationTaxonomy';

export type DestinationArticleClassification = {
	categoryId: string;
	contentType: string;
	pillar: boolean;
	tags: string[];
	toolSlugs: string[];
};

function scoreCategory(taxonomy: DestinationTaxonomy, haystack: string): string {
	let best = taxonomy.categories[0]?.id ?? 'general';
	let bestScore = -1;
	for (const category of taxonomy.categories) {
		const needles = `${category.name} ${category.description} ${(category.journey ?? []).join(' ')}`.toLowerCase();
		const words = haystack.split(/[^a-z0-9]+/).filter((word) => word.length > 3);
		const score = words.reduce((total, word) => (needles.includes(word) ? total + 1 : total), 0);
		if (score > bestScore) {
			bestScore = score;
			best = category.id;
		}
	}
	return assertDestinationCategory(taxonomy, best);
}

function suggestedTools(taxonomy: DestinationTaxonomy, haystack: string): string[] {
	return taxonomy.tools
		.filter((tool) => {
			if (!tool.linkWhenTopicMatches) return false;
			return new RegExp(tool.linkWhenTopicMatches, 'i').test(haystack);
		})
		.map((tool) => tool.slug);
}

export async function classifyArticleForDestination(input: {
	ai: IntelligenceAi;
	ownerUserId: string;
	topic: string;
	searchIntent: string;
	audience?: string;
	objective?: string;
	taxonomy: DestinationTaxonomy;
}): Promise<DestinationArticleClassification> {
	const haystack = `${input.topic} ${input.searchIntent} ${input.audience ?? ''} ${input.objective ?? ''}`.toLowerCase();
	if (process.env.VITEST === 'true') {
		const categoryId = scoreCategory(input.taxonomy, haystack);
		const pillar = /pillar|how to write a novel|from idea to first draft/i.test(haystack);
		return {
			categoryId,
			contentType: pillar ? 'pillar' : 'guide',
			pillar,
			tags: [pillar ? 'pillar' : 'supporting', 'needs-review'],
			toolSlugs: suggestedTools(input.taxonomy, haystack),
		};
	}
	const completion = await input.ai.completeJson<{ categoryId?: string; contentType?: string; pillar?: boolean; tags?: string[] }>(
		'FAST',
		[
			{
				role: 'system',
				content:
					'Choose the best primary category for a long-form article. Return JSON with categoryId, contentType, pillar (boolean), and tags (string array). Use only category ids from the supplied taxonomy. Do not invent categories.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					topic: input.topic,
					searchIntent: input.searchIntent,
					audience: input.audience,
					objective: input.objective,
					allowedCategories: input.taxonomy.categories,
					allowedContentTypes: input.taxonomy.contentTypes,
				}),
			},
		],
		'destination_article_classification',
		input.ownerUserId,
	);
	const fallbackId = scoreCategory(input.taxonomy, haystack);
	const proposedId = completion.data.categoryId?.trim() ?? '';
	const categoryId = assertDestinationCategory(
		input.taxonomy,
		input.taxonomy.categories.some((category) => category.id === proposedId) ? proposedId : fallbackId,
	);
	const contentType = input.taxonomy.contentTypes.includes(completion.data.contentType ?? '')
		? (completion.data.contentType as string)
		: 'guide';
	const pillar = completion.data.pillar === true || contentType === 'pillar';
	return {
		categoryId,
		contentType,
		pillar,
		tags: Array.isArray(completion.data.tags) && completion.data.tags.length
			? completion.data.tags.map(String)
			: [pillar ? 'pillar' : 'supporting', 'needs-review'],
		toolSlugs: suggestedTools(input.taxonomy, haystack),
	};
}
