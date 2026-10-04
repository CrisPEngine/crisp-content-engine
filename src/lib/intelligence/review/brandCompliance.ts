import { resolveTermRules } from '../termRules';
import type { BrandBrain, ContentBrief, TermEnforcementLevel } from '../types';

export type BrandComplianceIssue = {
	code: string;
	message: string;
	severity: 'low' | 'medium' | 'high';
	level: TermEnforcementLevel | 'editorial';
	forcesRevision: boolean;
};

function includesPhrase(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase().trim());
}

export function assessBrandCompliance(draft: string, brain: BrandBrain, brief: ContentBrief): BrandComplianceIssue[] {
	const issues: BrandComplianceIssue[] = [];
	const lower = draft.toLowerCase();
	const seen = new Set<string>();

	const add = (issue: BrandComplianceIssue) => {
		const key = `${issue.code}:${issue.message.toLowerCase()}`;
		if (seen.has(key)) return;
		seen.add(key);
		issues.push(issue);
	};

	for (const rule of resolveTermRules(brain.guardrails)) {
		const present = Boolean(rule.term) && includesPhrase(draft, rule.term);
		if ((rule.level === 'PROHIBITED' || rule.level === 'AVOID') && present) {
			add({
				code: rule.level === 'PROHIBITED' ? 'prohibited_phrase' : 'avoided_phrase',
				message: `${rule.level} term "${rule.term}" is present`,
				severity: 'high',
				level: rule.level,
				forcesRevision: true,
			});
		}
		if (rule.level === 'REQUIRED' && !present) {
			add({
				code: 'missing_required_term',
				message: `REQUIRED term "${rule.term}" is absent`,
				severity: 'high',
				level: 'REQUIRED',
				forcesRevision: true,
			});
		}
		if ((rule.level === 'STRONGLY_PREFERRED' || rule.level === 'PREFERRED') && !present) {
			add({
				code: 'preferred_term_absent',
				message: `${rule.level} term "${rule.term}" is absent. Observation only.`,
				severity: 'low',
				level: rule.level,
				forcesRevision: false,
			});
		}
	}

	for (const phrase of brief.prohibitedPhrases) {
		if (phrase && includesPhrase(draft, phrase)) {
			add({
				code: 'prohibited_phrase',
				message: `PROHIBITED term "${phrase}" is present`,
				severity: 'high',
				level: 'PROHIBITED',
				forcesRevision: true,
			});
		}
	}

	if ((brain.guardrails.promotionalIntensity || '').toLowerCase().includes('low') && /\bbuy now\b|\blimited time\b|\bdon'?t miss\b/i.test(draft)) {
		add({
			code: 'promotional_intensity',
			message: 'CTA/promotional intensity exceeds the brand guardrail',
			severity: 'high',
			level: 'PROHIBITED',
			forcesRevision: true,
		});
	}

	if (brief.cta && /no hard sell|no cta|none/i.test(brief.cta) && /\b(sign up|book a|buy now|subscribe here)\b/i.test(draft)) {
		add({
			code: 'cta_restriction',
			message: 'Brief asked for a restrained CTA but the draft includes a hard sell',
			severity: 'high',
			level: 'PROHIBITED',
			forcesRevision: true,
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
			add({
				code: 'positioning_drift',
				message: 'Draft does not reflect stated positioning language',
				severity: 'low',
				level: 'PREFERRED',
				forcesRevision: false,
			});
		}
	}

	return issues;
}

export function brandFitScore(issues: BrandComplianceIssue[]): number {
	if (issues.length === 0) return 0.94;
	const penalty = issues.reduce((sum, issue) => sum + (issue.forcesRevision ? 0.2 : issue.severity === 'medium' ? 0.1 : 0.04), 0);
	return Math.max(0.15, Math.round((0.94 - penalty) * 100) / 100);
}
