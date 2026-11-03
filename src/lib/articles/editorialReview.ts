export type ReviewFinding = {
	severity: 'critical' | 'major' | 'minor';
	code: string;
	instruction: string;
};

export type EditorialReview = {
	ready: boolean;
	findings: ReviewFinding[];
	cyclesUsed: number;
};

export function reviewArticleDraft(input: {
	body: string;
	wordCount: number;
	targetWords: number;
	category: string;
	allowedCategories: readonly string[];
	sourceCount: number;
	claimsExternalResearch: boolean;
	toolSlugs: string[];
}): EditorialReview {
	const findings: ReviewFinding[] = [];
	const min = Math.round(input.targetWords * 0.75);
	if (input.wordCount < min) {
		findings.push({
			severity: 'critical',
			code: 'too_short',
			instruction: `Expand the draft to at least ${min} words with practical steps. Do not add filler or invented statistics.`,
		});
	}
	if (!input.allowedCategories.includes(input.category)) {
		findings.push({
			severity: 'critical',
			code: 'unknown_category',
			instruction: `Set category to one of: ${input.allowedCategories.join(', ')}.`,
		});
	}
	if (input.claimsExternalResearch && input.sourceCount === 0) {
		findings.push({
			severity: 'critical',
			code: 'uncited_research',
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
				instruction: 'Remove the repeated paragraph and replace it with a distinct practical step.',
			});
			break;
		}
		seen.add(key);
	}
	if (/novel|first draft|word count/i.test(input.body) && !input.toolSlugs.includes('word-count-planner')) {
		findings.push({
			severity: 'major',
			code: 'missing_tool',
			instruction: 'Link the Word Count Planner where the draft discusses pace or length.',
		});
	}
	const ready = !findings.some((finding) => finding.severity === 'critical');
	return { ready, findings, cyclesUsed: 0 };
}
