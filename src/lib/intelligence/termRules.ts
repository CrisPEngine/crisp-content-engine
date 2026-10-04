import type { BrandGuardrails, BrandTermRule, TermEnforcementLevel } from './types';

const LEVELS = new Set<TermEnforcementLevel>(['REQUIRED', 'STRONGLY_PREFERRED', 'PREFERRED', 'AVOID', 'PROHIBITED']);

function pushUnique(rules: BrandTermRule[], seen: Set<string>, rule: BrandTermRule) {
	const key = rule.term.trim().toLowerCase();
	if (!key || seen.has(key)) return;
	seen.add(key);
	rules.push({ ...rule, term: rule.term.trim() });
}

export function resolveTermRules(guardrails: BrandGuardrails | undefined): BrandTermRule[] {
	const rules: BrandTermRule[] = [];
	const seen = new Set<string>();
	for (const rule of guardrails?.termRules ?? []) {
		if (!rule?.term || !LEVELS.has(rule.level)) continue;
		pushUnique(rules, seen, rule);
	}
	for (const term of guardrails?.requiredTerminology ?? []) {
		pushUnique(rules, seen, { term, level: 'REQUIRED', reason: 'Legacy requiredTerminology' });
	}
	for (const term of guardrails?.phrasesToAvoid ?? []) {
		pushUnique(rules, seen, { term, level: 'AVOID' });
	}
	for (const term of guardrails?.prohibitedClaims ?? []) {
		pushUnique(rules, seen, { term, level: 'PROHIBITED' });
	}
	return rules;
}

export function rulesAt(
	rules: BrandTermRule[],
	levels: TermEnforcementLevel[],
): BrandTermRule[] {
	const allowed = new Set(levels);
	return rules.filter((rule) => allowed.has(rule.level));
}
