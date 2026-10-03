import type { ConfidenceLevel, ContentMemoryRecord, OptimizationObjective, PerformanceSnapshot } from './types';
import { confidenceFromSample, objectiveScore } from './performance';

export type PerformanceBaseline = {
	channel: string;
	contentType?: string;
	objective: OptimizationObjective;
	n: number;
	mean: number | null;
	p25: number | null;
	p75: number | null;
	confidence: ConfidenceLevel;
	note: string;
};

function percentile(sorted: number[], p: number): number | null {
	if (sorted.length === 0) return null;
	const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
	return sorted[index];
}

export function computeBaseline(input: {
	snapshots: PerformanceSnapshot[];
	memory?: ContentMemoryRecord[];
	channel: string;
	contentType?: string;
	objective: OptimizationObjective;
}): PerformanceBaseline {
	const memoryById = new Map((input.memory ?? []).map((row) => [row.id, row]));
	const relevant = input.snapshots.filter((snapshot) => {
		if (snapshot.channel !== input.channel) return false;
		if (!input.contentType) return true;
		const memory = snapshot.memoryId ? memoryById.get(snapshot.memoryId) : undefined;
		return !memory || memory.contentType === input.contentType;
	});
	const scores = relevant
		.map((snapshot) => objectiveScore(snapshot, input.objective).score)
		.filter((value): value is number => value != null)
		.sort((a, b) => a - b);
	const mean = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
	const confidence = confidenceFromSample(scores.length);

	return {
		channel: input.channel,
		contentType: input.contentType,
		objective: input.objective,
		n: scores.length,
		mean,
		p25: percentile(scores, 25),
		p75: percentile(scores, 75),
		confidence,
		note:
			confidence === 'insufficient'
				? 'Insufficient history to form a baseline. No ranking is claimed.'
				: `Observational ${input.objective} baseline for ${input.channel}. Not a guarantee of future performance.`,
	};
}

export function compareToBaseline(input: {
	snapshot: PerformanceSnapshot;
	baseline: PerformanceBaseline;
	objective: OptimizationObjective;
}): {
	relative: 'above' | 'within' | 'below' | 'unknown';
	lift?: number;
	confidence: ConfidenceLevel;
	summary: string;
} {
	const score = objectiveScore(input.snapshot, input.objective).score;
	if (score == null || input.baseline.mean == null || input.baseline.confidence === 'insufficient') {
		return {
			relative: 'unknown',
			confidence: 'insufficient',
			summary: input.baseline.note,
		};
	}
	const lift = input.baseline.mean === 0 ? undefined : (score - input.baseline.mean) / Math.abs(input.baseline.mean);
	const bandLow = input.baseline.p25 ?? input.baseline.mean * 0.9;
	const bandHigh = input.baseline.p75 ?? input.baseline.mean * 1.1;
	const relative = score > bandHigh ? 'above' : score < bandLow ? 'below' : 'within';
	return {
		relative,
		lift,
		confidence: input.baseline.confidence,
		summary: `Based on ${input.baseline.n} comparable posts, this ${input.snapshot.channel} item is ${relative} the ${input.objective} baseline. Observational only — not a forecast of impressions, clicks, or conversions.`,
	};
}
