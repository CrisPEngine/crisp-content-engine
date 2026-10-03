import type { ContentBrief, ContentLearning, ContentScorecard, ContentTheme } from './types';
import type { MemoryRetrieval } from './contentMemory';
import { overlapScore } from './contentMemory';

export function scoreDraft(input: {
	draft: string;
	brief: ContentBrief;
	theme?: ContentTheme | null;
	memory: MemoryRetrieval;
	learnings: ContentLearning[];
	brandFit: number;
	proseScore: number;
	comparableCount: number;
}): ContentScorecard {
	const { draft, brief, theme, memory, learnings, brandFit, proseScore, comparableCount } = input;

	const objectiveFit = brief.optimizationObjective === 'authority' && /because|evidence|for example|we (measured|saw|found)/i.test(draft)
		? 0.86
		: brief.optimizationObjective === 'engagement' && /\?/.test(draft)
			? 0.8
			: 0.72;

	const originality = memory.related.some((row) => overlapScore(draft, row.body) > 0.55)
		? 0.45
		: memory.warnings.length > 2
			? 0.6
			: 0.88;

	const themeRelevance = theme
		? Math.min(
				1,
				0.4 +
					0.15 * theme.keyArguments.filter((argument) => draft.toLowerCase().includes(argument.toLowerCase().slice(0, 18))).length +
					(brief.theme ? 0.2 : 0),
			)
		: 0.5;

	const hookStrength = draft.trim().split('\n')[0]?.length > 12 && !/in today'?s/i.test(draft) ? 0.78 : 0.5;
	const clarity = draft.length > 80 && draft.length < 6000 ? 0.8 : 0.55;
	const evidence = brief.evidence.some((item) => overlapScore(draft, item) > 0.15) ? 0.82 : 0.58;
	const ctaAlignment = overlapScore(draft.slice(-400), brief.cta) > 0.1 || /no cta/i.test(brief.cta) ? 0.8 : 0.55;

	const predictedAudienceRelevance =
		comparableCount >= 8
			? Math.round(((brandFit + objectiveFit + themeRelevance) / 3) * 100) / 100
			: null;

	const predictionNote =
		comparableCount < 8
			? `Insufficient history (${comparableCount} comparable posts). No performance prediction is claimed.`
			: learnings.length
				? `Relative expectation only, based on ${comparableCount} comparable posts and ${learnings.length} observational learnings. Not a guarantee of impressions, clicks, or conversions.`
				: `Relative expectation only, based on ${comparableCount} comparable posts. Not a guarantee.`;

	return {
		brandFit,
		objectiveFit,
		originality,
		themeRelevance,
		hookStrength,
		clarity,
		evidence,
		ctaAlignment,
		humanProse: proseScore,
		predictedAudienceRelevance,
		predictionNote,
	};
}
