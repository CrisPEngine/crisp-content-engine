import { describe, expect, it } from 'vitest';
import { critiqueDraft, exampleConsistencyIssues, planFromFeedback } from '@/lib/articles/editorialDesk';

const FEEDBACK =
	'Improve this article’s authority and usefulness. Open with a realistic continuity mistake. Make the fictional examples consistent. Strengthen the explanation of how continuity errors occur and how writers detect them. Use verified Folian capabilities rather than unnecessarily cautious product language. Improve the research and distinguish independent sources from competitor marketing. Strengthen the final CTA. Preserve the practical tables and checklists. Keep the article close to 2,200 words.';

describe('editorial desk', () => {
	it('flags a weak opening, cautious product language, vendor research and a weak close without rewriting', () => {
		const body = [
			'## Build a Story Bible You Can Trust',
			'A story bible answers where a fact was established.',
			'| Entity | Established fact |',
			'| Mara Venn | Commands the crew |',
			'## Choose Software for the Job',
			'It is unclear whether Folian can track canon. Investigate whether it helps.',
			'## Close',
			'That is the method.',
		].join('\n');
		const critique = critiqueDraft({
			title: 'How to Prevent Continuity Errors',
			topic: 'continuity errors',
			body,
			brandName: 'Folian',
			productFacts: ['Author review before a fact enters canon'],
			sourceClasses: ['competitor', 'competitor', 'background'],
			targetWords: 2200,
		});
		const ids = critique.findings.map((finding) => finding.id);
		expect(ids).toContain('intro-weak');
		expect(ids).toContain('definition-thin');
		expect(ids).toContain('product-cautious');
		expect(ids).toContain('vendor-research');
		expect(ids).toContain('cta-weak');
		expect(critique.strengths.some((item) => /tables/i.test(item))).toBe(true);
		expect(body).toContain('Story Bible');
	});

	it('turns the continuity feedback into scoped proposals and leaves rejected ones unapplied', () => {
		const proposals = planFromFeedback(FEEDBACK, '## Choose Software for the Job\n\nBody');
		expect(proposals.map((item) => item.scope)).toEqual(expect.arrayContaining(['section', 'article', 'research', 'cta']));
		expect(proposals.some((item) => item.needsResearch)).toBe(true);
		expect(proposals.some((item) => item.needsBrandVerification)).toBe(true);
		const rejected = proposals.map((item, index) => (index === 0 ? { ...item, status: 'rejected' as const } : { ...item, status: 'accepted' as const }));
		expect(rejected.filter((item) => item.status === 'accepted').every((item) => item.id !== rejected[0]?.id)).toBe(true);
	});

	it('flags incompatible fictional facts', () => {
		const issues = exampleConsistencyIssues('| Mara | injured in chapter 3 |\n| Mara | uninjured |');
		expect(issues.some((issue) => /injured/i.test(issue))).toBe(true);
	});
});
