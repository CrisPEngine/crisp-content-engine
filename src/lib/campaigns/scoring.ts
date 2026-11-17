import { DEFAULT_SCORE_THRESHOLDS, DEFAULT_SCORE_WEIGHTS, type DemandClass, type EvidenceConfidence, type MeasuredSearch, type OpportunityEvidence, type OptimisationScope, type ScoreResult, type ScoreThresholds, type ScoreWeights } from './types';

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function demandValue(demandClass: DemandClass, measured: MeasuredSearch | null, thresholds: ScoreThresholds): { value: number; rationale: string } {
	if (demandClass === 'observed' && measured) {
		const page = measured.scope === 'page';
		const value = clamp((measured.impressions / 1000) * (page ? thresholds.pageDemandFactor : 1));
		return {
			value,
			rationale: page
				? `Page total, not exact-query demand: ${measured.impressions} impressions, ${measured.clicks} clicks, CTR ${(measured.ctr * 100).toFixed(1)}%, average position ${measured.position.toFixed(1)} from ${measured.startDate} to ${measured.endDate}.`
				: `Query total: ${measured.impressions} impressions, ${measured.clicks} clicks, CTR ${(measured.ctr * 100).toFixed(1)}%, average position ${measured.position.toFixed(1)} from ${measured.startDate} to ${measured.endDate}.`,
		};
	}
	if (demandClass === 'inferred') {
		return { value: 0.35, rationale: 'Public search results were retrieved. Search volume was not measured, so this is inferred coverage rather than observed demand.' };
	}
	if (demandClass === 'strategic') {
		return { value: 0.2, rationale: 'This comes from approved strategy or themes. It is an editorial direction, not evidence of audience demand.' };
	}
	return { value: 0, rationale: 'No evidence of audience demand is stored. An idea alone does not count as demand.' };
}

function searchValue(measured: MeasuredSearch | null, thresholds: ScoreThresholds): { value: number; rationale: string } {
	if (!measured) return { value: 0, rationale: 'No search-performance metrics are available for this opportunity.' };
	const weakPosition = measured.position > thresholds.leadingPosition ? 0.7 : 0.3;
	const seen = measured.impressions > 0 ? 0.3 : 0;
	const scope = measured.scope === 'page' ? 'page' : 'query';
	return {
		value: clamp(weakPosition + seen),
		rationale: measured.position > thresholds.leadingPosition
			? `${scope} average position ${measured.position.toFixed(1)} is outside the leading positions. The impression count is ${measured.impressions}.`
			: `${scope} average position ${measured.position.toFixed(1)} is already inside the leading positions.`,
	};
}

export function optimisationScope(measured: MeasuredSearch | null, thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS): OptimisationScope {
	if (!measured) return 'none';
	if (measured.position <= thresholds.leadingPosition && measured.ctr < thresholds.lowCtr) return 'metadata';
	if (measured.position > thresholds.leadingPosition && measured.impressions >= thresholds.meaningfulImpressions) return 'section';
	if (measured.impressions < thresholds.meaningfulImpressions) return 'none';
	return 'expansion';
}

export function evidenceConfidence(demandClass: DemandClass, evidenceCount: number, measured: MeasuredSearch | null, thresholds: ScoreThresholds = DEFAULT_SCORE_THRESHOLDS): EvidenceConfidence {
	if (demandClass === 'observed' && measured && evidenceCount > 0) {
		if (measured.scope === 'page') return 'medium';
		return measured.impressions >= thresholds.highConfidenceImpressions ? 'high' : 'medium';
	}
	if (demandClass === 'inferred' && evidenceCount > 0) return 'medium';
	if (demandClass === 'strategic') return 'low';
	return 'none';
}

export function scoreOpportunity(input: {
	demandClass: DemandClass;
	measured?: MeasuredSearch | null;
	evidenceCount: number;
	brandRelevance: number;
	brandRationale: string;
	uniqueValue: number;
	uniqueRationale: string;
	businessRelevance: number;
	businessRationale: string;
	researchFeasibility: number;
	researchRationale: string;
	weights?: ScoreWeights;
	thresholds?: ScoreThresholds;
	grounded?: boolean;
}): ScoreResult {
	const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
	const thresholds = input.thresholds ?? DEFAULT_SCORE_THRESHOLDS;
	const measured = input.demandClass === 'observed' ? input.measured ?? null : null;
	const demand = demandValue(input.demandClass, measured, thresholds);
	const search = searchValue(measured, thresholds);
	const rows = [
		{ key: 'audienceDemand' as const, value: demand.value, rationale: demand.rationale },
		{ key: 'brandRelevance' as const, value: clamp(input.brandRelevance), rationale: input.brandRationale },
		{ key: 'uniqueValue' as const, value: clamp(input.uniqueValue), rationale: input.uniqueRationale },
		{ key: 'searchOpportunity' as const, value: search.value, rationale: search.rationale },
		{ key: 'businessRelevance' as const, value: clamp(input.businessRelevance), rationale: input.businessRationale },
		{ key: 'researchFeasibility' as const, value: clamp(input.researchFeasibility), rationale: input.researchRationale },
	];
	const components = rows.map((row) => ({
		...row,
		weight: weights[row.key],
		contribution: Math.round(weights[row.key] * row.value * 1000) / 1000,
	}));
	const score = Math.round(components.reduce((sum, row) => sum + row.contribution, 0) * 1000) / 1000;
	const confidence = evidenceConfidence(input.demandClass, input.evidenceCount, measured, thresholds);
	const ungrounded = input.grounded === false;
	const promotionBlocked = input.demandClass === 'unvalidated' || confidence === 'none' || ungrounded;
	return {
		score,
		confidence,
		components,
		promotionBlocked,
		blockReason: ungrounded
			? 'External search results alone do not validate this opportunity.'
			: promotionBlocked
				? 'This opportunity has no demand evidence, so it cannot enter production.'
				: null,
	};
}

export function storedEvidenceScope(evidence: OpportunityEvidence[]): 'query' | 'page' | null {
	const measured = evidence.find((item) => item.metrics);
	if (!measured?.metrics) return null;
	if (measured.metrics.scope === 'page' || measured.excerpt?.includes('Page total')) return 'page';
	if (measured.metrics.scope === 'query' || measured.sourceKind === 'search_console') return 'query';
	return null;
}

export function rescoredConfidence(input: {
	demandClass: DemandClass;
	evidence: OpportunityEvidence[];
	thresholds?: ScoreThresholds;
}): EvidenceConfidence {
	const scope = storedEvidenceScope(input.evidence);
	const measured = input.evidence.find((item) => item.metrics)?.metrics ?? null;
	const adjusted = measured && scope ? { ...measured, scope } : measured;
	return evidenceConfidence(input.demandClass, input.evidence.length, adjusted, input.thresholds);
}
