import type { BrandBrain, BrandStrategy } from '../types';

export type ValidationIssue = {
	path: string;
	severity: 'error' | 'warning';
	message: string;
};

export type BrandValidation = {
	ok: boolean;
	score: number;
	issues: ValidationIssue[];
};

function missing(value: unknown): boolean {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim().length === 0;
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

export function validateBrandBrain(brain: BrandBrain, strategy?: BrandStrategy | null): BrandValidation {
	const issues: ValidationIssue[] = [];

	const requireString = (path: string, value: unknown, severity: ValidationIssue['severity'] = 'error') => {
		if (missing(value)) issues.push({ path, severity, message: `${path} is required` });
	};

	requireString('identity.name', brain.identity.name);
	requireString('identity.positioning', brain.identity.positioning);
	requireString('identity.purpose', brain.identity.purpose, 'warning');
	requireString('identity.audiences', brain.identity.audiences);
	requireString('voice.tone', brain.voice.tone);
	requireString('voice.formality', brain.voice.formality, 'warning');
	requireString('guardrails.phrasesToAvoid', brain.guardrails.phrasesToAvoid, 'warning');
	requireString('guardrails.promotionalIntensity', brain.guardrails.promotionalIntensity, 'warning');
	requireString('knowledge.proofPoints', brain.knowledge.proofPoints, 'warning');

	if ((brain.examples ?? []).filter((example) => example.kind === 'good' || example.kind === 'representative').length === 0) {
		issues.push({ path: 'examples', severity: 'warning', message: 'Add at least one good or representative example' });
	}

	if (strategy) {
		requireString('strategy.objectives', strategy.objectives);
		requireString('strategy.keyMessages', strategy.keyMessages);
		requireString('strategy.contentPillars', strategy.contentPillars, 'warning');
		if (strategy.channelStrategies.length === 0) {
			issues.push({ path: 'strategy.channelStrategies', severity: 'warning', message: 'Add at least one channel strategy' });
		}
	} else {
		issues.push({ path: 'strategy', severity: 'error', message: 'Native strategy is missing' });
	}

	const errors = issues.filter((issue) => issue.severity === 'error').length;
	const warnings = issues.filter((issue) => issue.severity === 'warning').length;
	const score = Math.max(0, Math.round((1 - errors * 0.18 - warnings * 0.06) * 100) / 100);

	return {
		ok: errors === 0,
		score,
		issues,
	};
}

export function validateFolianBrand(brain: BrandBrain, strategy?: BrandStrategy | null): BrandValidation {
	const base = validateBrandBrain(brain, strategy);
	const extra: ValidationIssue[] = [];

	if (!/folian/i.test(brain.identity.name)) {
		extra.push({ path: 'identity.name', severity: 'error', message: 'Expected Folian brand name' });
	}
	if (!/memory|canon|continuity/i.test(`${brain.identity.positioning} ${brain.identity.purpose}`)) {
		extra.push({
			path: 'identity.positioning',
			severity: 'error',
			message: 'Folian positioning must mention memory, canon, or continuity',
		});
	}
	const required = brain.guardrails.requiredTerminology ?? [];
	if (!required.some((term) => /canon/i.test(term)) || !required.some((term) => /continuity/i.test(term))) {
		extra.push({
			path: 'guardrails.requiredTerminology',
			severity: 'error',
			message: 'Folian requires terminology: canon and continuity',
		});
	}
	if ((brain.guardrails.promotionalIntensity || '').toLowerCase() !== 'low') {
		extra.push({
			path: 'guardrails.promotionalIntensity',
			severity: 'warning',
			message: 'Folian should stay at low promotional intensity',
		});
	}

	const issues = [...base.issues, ...extra];
	const errors = issues.filter((issue) => issue.severity === 'error').length;
	return {
		ok: errors === 0,
		score: Math.min(base.score, errors === 0 ? base.score : 0.55),
		issues,
	};
}
