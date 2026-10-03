import type { BrandBrain, ContentBrief } from '../types';

export type BrandComplianceIssue = {
	code: string;
	message: string;
	severity: 'low' | 'medium' | 'high';
};

function includesPhrase(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}

export function assessBrandCompliance(draft: string, brain: BrandBrain, brief: ContentBrief): BrandComplianceIssue[] {
	const issues: BrandComplianceIssue[] = [];
	const lower = draft.toLowerCase();

	for (const phrase of brief.prohibitedPhrases) {
		if (phrase && includesPhrase(draft, phrase)) {
			issues.push({
				code: 'prohibited_phrase',
				message: `Contains prohibited phrase "${phrase}"`,
				severity: 'high',
			});
		}
	}

	for (const claim of brain.guardrails.prohibitedClaims ?? []) {
		if (claim && includesPhrase(draft, claim)) {
			issues.push({
				code: 'prohibited_claim',
				message: `May repeat prohibited claim "${claim}"`,
				severity: 'high',
			});
		}
	}

	for (const term of brain.guardrails.requiredTerminology ?? []) {
		if (term && !includesPhrase(draft, term) && brief.relevantBrandContext.some((item) => includesPhrase(item, term))) {
			issues.push({
				code: 'missing_term',
				message: `Required terminology "${term}" is absent`,
				severity: 'medium',
			});
		}
	}

	if ((brain.guardrails.promotionalIntensity || '').toLowerCase().includes('low') && /\bbuy now\b|\blimited time\b|\bdon'?t miss\b/i.test(draft)) {
		issues.push({
			code: 'promotional_intensity',
			message: 'CTA/promotional intensity exceeds the brand guardrail',
			severity: 'medium',
		});
	}

	if (brief.cta && /no cta|none/i.test(brief.cta) && /\b(sign up|book a|buy|subscribe here)\b/i.test(draft)) {
		issues.push({
			code: 'cta_restriction',
			message: 'Brief asked for a restrained CTA but the draft includes a hard sell',
			severity: 'medium',
		});
	}

	if (brain.identity.positioning && lower.length > 80) {
		const positioningTokens = brain.identity.positioning
			.toLowerCase()
			.split(/\W+/)
			.filter((token) => token.length > 4)
			.slice(0, 6);
		const hits = positioningTokens.filter((token) => lower.includes(token)).length;
		if (positioningTokens.length >= 3 && hits === 0) {
			issues.push({
				code: 'positioning_drift',
				message: 'Draft does not reflect stated positioning language',
				severity: 'low',
			});
		}
	}

	return issues;
}

export function brandFitScore(issues: BrandComplianceIssue[]): number {
	if (issues.length === 0) return 0.94;
	const penalty = issues.reduce((sum, issue) => sum + (issue.severity === 'high' ? 0.2 : issue.severity === 'medium' ? 0.1 : 0.04), 0);
	return Math.max(0.15, Math.round((0.94 - penalty) * 100) / 100);
}
