import { computeBaseline } from './baselines';
import type { ContentMemoryRecord, OptimizationObjective, PerformanceSnapshot } from './types';
import { confidenceFromSample } from './performance';

export function performanceHintsForGeneration(input: {
	snapshots: PerformanceSnapshot[];
	memory: ContentMemoryRecord[];
	channel: string;
	objective?: OptimizationObjective;
}): string[] {
	const objective = input.objective ?? 'engagement';
	const baseline = computeBaseline({
		snapshots: input.snapshots,
		memory: input.memory,
		channel: input.channel,
		objective,
	});

	const lines: string[] = [];
	if (baseline.confidence === 'insufficient' || baseline.n < 5) {
		lines.push(
			`Performance history for ${input.channel} is thin (${baseline.n} comparable posts). Do not imitate format or timing as proven winners.`,
		);
		return lines;
	}

	lines.push(baseline.note);
	if (baseline.mean != null) {
		lines.push(
			`Observational ${objective} baseline on ${input.channel}: typical band between p25 and p75. Treat as weak prior only (${baseline.n} posts, ${baseline.confidence} confidence).`,
		);
	}

	const ranked = [...input.snapshots]
		.filter((row) => row.channel === input.channel && (row.engagementRate ?? 0) > 0)
		.sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0));

	if (ranked.length >= 4 && confidenceFromSample(ranked.length) !== 'insufficient') {
		const top = ranked.slice(0, 2);
		lines.push(
			`Recent top posts on ${input.channel} (observational, not causal): ${top
				.map((row) => `memory ${row.memoryId ?? 'unknown'} engagement ${((row.engagementRate ?? 0) * 100).toFixed(1)}%`)
				.join('; ')}.`,
		);
	}

	return lines;
}
