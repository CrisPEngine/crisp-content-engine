import type { BrandBrain, ContentBrief, ReviewResult } from '../types';
import { assessBrandCompliance, brandFitScore } from './brandCompliance';
import { detectProsePatterns, proseScoreFromHits, shouldRewrite } from './prosePatterns';

function applyDeterministicFixes(draft: string, brief: ContentBrief): string {
	let next = draft;
	for (const phrase of brief.prohibitedPhrases) {
		if (!phrase) continue;
		const pattern = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
		next = next.replace(pattern, '').replace(/\s{2,}/g, ' ');
	}
	next = next.replace(/^\s*(so[,.]?\s+|look[,.]?\s+|okay[,.]?\s+)/i, '');
	next = next.replace(/\bin conclusion,?\s+/gi, '');
	next = next.replace(/\bthe key takeaway is\s+/gi, '');
	return next.trim();
}

export function reviewDraft(input: {
	draft: string;
	brain: BrandBrain;
	brief: ContentBrief;
	improvedByModel?: string;
}): ReviewResult {
	const hits = detectProsePatterns(input.draft);
	const issues = assessBrandCompliance(input.draft, input.brain, input.brief);
	const prose = proseScoreFromHits(hits);
	const brand = brandFitScore(issues);

	let improved = input.improvedByModel?.trim() || input.draft;
	if (!input.improvedByModel && (shouldRewrite(hits) || issues.some((issue) => issue.severity === 'high'))) {
		improved = applyDeterministicFixes(input.draft, input.brief);
	}

	return {
		brandFit: {
			score: brand,
			issues: issues.map((issue) => issue.message),
			passed: !issues.some((issue) => issue.severity === 'high'),
		},
		prose: {
			score: prose,
			hits,
			notes: hits.length
				? ['Pattern hits are diagnostic, not automatic rejection. Brand voice remains authoritative.']
				: ['No common low-quality AI patterns detected.'],
		},
		improvedDraft: improved,
		changed: improved.trim() !== input.draft.trim(),
	};
}

export { detectProsePatterns, assessBrandCompliance };
