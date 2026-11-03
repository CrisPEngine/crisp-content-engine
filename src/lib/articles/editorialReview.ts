import type { DestinationTaxonomy } from '@/lib/publishing/destinationTaxonomy';
import type { BrandBrain } from '@/lib/intelligence/types';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';

export type ReviewFinding = {
	severity: 'critical' | 'major' | 'minor';
	code: string;
	instruction: string;
	source: 'deterministic' | 'llm';
};

export type EditorialReview = {
	ready: boolean;
	findings: ReviewFinding[];
};

export function runDeterministicArticleReview(input: {
	body: string;
	wordCount: number;
	targetWords: number;
	categoryId: string;
	taxonomy: DestinationTaxonomy;
	sourceCount: number;
	claimsExternalResearch: boolean;
	toolSlugs: string[];
}): EditorialReview {
	const findings: ReviewFinding[] = [];
	const allowed = input.taxonomy.categories.map((item) => item.id);
	const min = Math.round(input.targetWords * 0.75);
	if (input.wordCount < min) {
		findings.push({
			severity: 'critical',
			code: 'too_short',
			source: 'deterministic',
			instruction: `Expand the draft to at least ${min} words with practical steps. Do not add filler or invented statistics.`,
		});
	}
	if (!allowed.includes(input.categoryId)) {
		findings.push({
			severity: 'critical',
			code: 'unknown_category',
			source: 'deterministic',
			instruction: `Set category to one of: ${allowed.join(', ')}.`,
		});
	}
	if (input.claimsExternalResearch && input.sourceCount === 0) {
		findings.push({
			severity: 'critical',
			code: 'uncited_research',
			source: 'deterministic',
			instruction: 'Remove claims that cite external research, or attach the stored source URL. Do not invent citations.',
		});
	}
	const paragraphs = input.body.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
	const seen = new Set<string>();
	for (const paragraph of paragraphs) {
		const key = paragraph.toLowerCase();
		if (seen.has(key) && paragraph.length > 80) {
			findings.push({
				severity: 'major',
				code: 'repetition',
				source: 'deterministic',
				instruction: 'Remove the repeated paragraph and replace it with a distinct practical step.',
			});
			break;
		}
		seen.add(key);
	}
	for (const tool of input.taxonomy.tools) {
		if (!tool.linkWhenTopicMatches) continue;
		if (new RegExp(tool.linkWhenTopicMatches, 'i').test(input.body) && !input.toolSlugs.includes(tool.slug)) {
			findings.push({
				severity: 'major',
				code: 'missing_destination_resource',
				source: 'deterministic',
				instruction: `Link ${tool.label} where the draft discusses that topic.`,
			});
		}
	}
	const ready = !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}

export async function runLlmEditorialReview(input: {
	ai: IntelligenceAi;
	ownerUserId: string;
	brain: BrandBrain;
	topic: string;
	searchIntent: string;
	body: string;
	categoryId: string;
}): Promise<EditorialReview> {
	if (process.env.VITEST === 'true') return { ready: true, findings: [] };
	const completion = await input.ai.completeJson<{ ready?: boolean; findings?: Array<{ severity?: string; code?: string; instruction?: string }> }>(
		'REVIEW',
		[
			{
				role: 'system',
				content:
					'Review the article for editorial readiness. Return JSON with ready (boolean) and findings (array of severity, code, instruction). Assess search intent, completeness, usefulness, source discipline, voice fit, SEO fit, and category fit. Do not rewrite the article.',
			},
			{
				role: 'user',
				content: JSON.stringify({
					topic: input.topic,
					searchIntent: input.searchIntent,
					categoryId: input.categoryId,
					voice: input.brain.voice,
					guardrails: input.brain.guardrails,
					body: input.body.slice(0, 12000),
				}),
			},
		],
		'destination_editorial_review',
		input.ownerUserId,
	);
	const findings: ReviewFinding[] = (completion.data.findings ?? [])
		.filter((item) => item.instruction && item.code)
		.map((item) => ({
			severity: item.severity === 'critical' || item.severity === 'major' ? item.severity : 'minor',
			code: String(item.code),
			instruction: String(item.instruction),
			source: 'llm' as const,
		}));
	const ready = completion.data.ready === true && !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}

export function mergeEditorialReviews(...reviews: EditorialReview[]): EditorialReview {
	const findings = reviews.flatMap((review) => review.findings);
	const ready = reviews.every((review) => review.ready) && !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings };
}
