import { DEFAULT_SCORE_WEIGHTS, type DemandClass, type EvidenceConfidence, type MeasuredSearch, type ScoreResult, type ScoreWeights } from './types';

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function demandValue(demandClass: DemandClass, measured: MeasuredSearch | null): { value: number; rationale: string } {
	if (demandClass === 'observed' && measured) {
		const value = clamp(measured.impressions / 1000);
		return {
			value,
			rationale: `${measured.impressions} impressions, ${measured.clicks} clicks, CTR ${(measured.ctr * 100).toFixed(1)}%, average position ${measured.position.toFixed(1)} from ${measured.startDate} to ${measured.endDate}.`,
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

function searchValue(measured: MeasuredSearch | null): { value: number; rationale: string } {
	if (!measured) return { value: 0, rationale: 'No search-performance metrics are available for this opportunity.' };
	const weakPosition = measured.position > 10 ? 0.7 : 0.3;
	const seen = measured.impressions > 0 ? 0.3 : 0;
	return {
		value: clamp(weakPosition + seen),
		rationale: measured.position > 10
			? `Average position ${measured.position.toFixed(1)} with ${measured.impressions} impressions leaves room to improve an existing query.`
			: `Average position ${measured.position.toFixed(1)} is already strong. A new article needs a distinct query.`,
	};
}

export function evidenceConfidence(demandClass: DemandClass, evidenceCount: number, measured: MeasuredSearch | null): EvidenceConfidence {
	if (demandClass === 'observed' && measured && evidenceCount > 0) return measured.impressions >= 50 ? 'high' : 'medium';
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
}): ScoreResult {
	const weights = input.weights ?? DEFAULT_SCORE_WEIGHTS;
	const measured = input.demandClass === 'observed' ? input.measured ?? null : null;
	const demand = demandValue(input.demandClass, measured);
	const search = searchValue(measured);
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
	const confidence = evidenceConfidence(input.demandClass, input.evidenceCount, measured);
	const promotionBlocked = input.demandClass === 'unvalidated' || confidence === 'none';
	return {
		score,
		confidence,
		components,
		promotionBlocked,
		blockReason: promotionBlocked ? 'This opportunity has no demand evidence, so it cannot enter production.' : null,
	};
}
