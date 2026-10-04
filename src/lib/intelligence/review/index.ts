import type { BrandBrain, ContentBrief, ReviewFinding, ReviewResult } from '../types';
import { assessBrandCompliance, brandFitScore, type BrandComplianceIssue } from './brandCompliance';
import { detectProsePatterns, proseScoreFromHits } from './prosePatterns';

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripMaterialPhrases(draft: string, issues: BrandComplianceIssue[]): string {
	let next = draft;
	for (const issue of issues) {
		if (!issue.forcesRevision) continue;
		const match = issue.message.match(/"([^"]+)"/);
		const phrase = match?.[1];
		if (!phrase) continue;
		next = next.replace(new RegExp(escapeRegExp(phrase), 'gi'), '').replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1');
	}
	return next.trim();
}

function findingsFrom(issues: BrandComplianceIssue[], proseHigh: ReviewFinding[]): ReviewFinding[] {
	return [
		...issues.map((issue) => ({
			code: issue.code,
			message: issue.message,
			level: issue.level,
			forcesRevision: issue.forcesRevision,
		})),
		...proseHigh,
	];
}

function proseFindings(draft: string): { hits: ReturnType<typeof detectProsePatterns>; findings: ReviewFinding[] } {
	const hits = detectProsePatterns(draft);
	const findings = hits
		.filter((hit) => hit.severity === 'high')
		.map((hit) => ({
			code: hit.id,
			message: `Editorial pattern: ${hit.label}`,
			level: 'editorial' as const,
			forcesRevision: true,
		}));
	return { hits, findings };
}

function revisionReason(findings: ReviewFinding[]): string | null {
	const material = findings.filter((finding) => finding.forcesRevision);
	if (material.length === 0) return null;
	return material.map((finding) => finding.message).join('; ');
}

export function reviewDraft(input: {
	draft: string;
	brain: BrandBrain;
	brief: ContentBrief;
	revisedDraft?: string;
	revisionReason?: string | null;
}): ReviewResult {
	const checkedDraft = input.revisedDraft?.trim() || input.draft;
	const brandIssues = assessBrandCompliance(checkedDraft, input.brain, input.brief);
	const prose = proseFindings(checkedDraft);
	const findings = findingsFrom(brandIssues, prose.findings);
	const reason = input.revisionReason ?? revisionReason(findings);
	const materialPassed = !findings.some((finding) => finding.forcesRevision);
	return {
		brandFit: {
			score: brandFitScore(brandIssues),
			issues: findings.map((finding) => finding.message),
			passed: materialPassed,
		},
		prose: {
			score: proseScoreFromHits(prose.hits),
			hits: prose.hits,
			notes: prose.hits.length
				? ['Preferred observations do not force a rewrite. Only material violations do.']
				: ['No common low-quality AI patterns detected.'],
		},
		originalDraft: input.draft,
		improvedDraft: checkedDraft,
		changed: checkedDraft.trim() !== input.draft.trim(),
		findings,
		revisionReason: input.revisedDraft ? reason : null,
		materialPassed,
	};
}

export async function completeReview(input: {
	draft: string;
	brain: BrandBrain;
	brief: ContentBrief;
	revise?: (draft: string, reason: string) => Promise<string | null | undefined>;
}): Promise<ReviewResult> {
	const initialBrand = assessBrandCompliance(input.draft, input.brain, input.brief);
	const initialProse = proseFindings(input.draft);
	const initialFindings = findingsFrom(initialBrand, initialProse.findings);
	const reason = revisionReason(initialFindings);
	if (!reason) {
		return reviewDraft({ draft: input.draft, brain: input.brain, brief: input.brief });
	}

	let candidate = stripMaterialPhrases(input.draft, initialBrand);
	const afterStrip = reviewDraft({
		draft: input.draft,
		brain: input.brain,
		brief: input.brief,
		revisedDraft: candidate === input.draft ? undefined : candidate,
		revisionReason: reason,
	});
	if (afterStrip.materialPassed) return afterStrip;

	if (input.revise) {
		try {
			const revised = (await input.revise(candidate || input.draft, reason))?.trim();
			if (revised) candidate = revised;
		} catch {
			// One revision attempt failed. Keep the deterministic candidate and record the original violations.
		}
	}

	const finalReview = reviewDraft({
		draft: input.draft,
		brain: input.brain,
		brief: input.brief,
		revisedDraft: candidate,
		revisionReason: reason,
	});
	return finalReview;
}

export { detectProsePatterns, assessBrandCompliance };
