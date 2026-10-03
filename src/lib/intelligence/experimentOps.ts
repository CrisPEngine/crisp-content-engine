import { analyseExperiment, PRAGMATIC_CONTROLS } from './experiments';
import { deriveRates } from './performance';
import type { IntelligenceStore } from './store';
import type { Experiment, OptimizationObjective } from './types';

export async function attachExperimentVariant(
	store: IntelligenceStore,
	userId: string,
	input: { experimentId: string; variantId: string; memoryId: string },
) {
	const experiment = await store.getExperiment(userId, input.experimentId);
	if (!experiment) throw new Error('Experiment not found');
	const variant = experiment.variants.find((row) => row.id === input.variantId);
	if (!variant) throw new Error('Variant not found');
	const memory = await store.getMemory(userId, input.memoryId);
	if (!memory) throw new Error('Content memory not found');

	await store.addVariant(userId, {
		...variant,
		memoryId: memory.id,
	});
	await store.saveMemory(userId, {
		...memory,
		experimentId: experiment.id,
	});
	if (experiment.status === 'draft') {
		await store.updateExperiment(userId, experiment.id, { status: 'ready' });
	}
	return store.getExperiment(userId, experiment.id);
}

export async function collectExperimentResults(
	store: IntelligenceStore,
	userId: string,
	experimentId: string,
) {
	const experiment = await store.getExperiment(userId, experimentId);
	if (!experiment) throw new Error('Experiment not found');
	const snapshots = await store.listPerformance(userId, experiment.brandBrainId);

	for (const variant of experiment.variants) {
		if (!variant.memoryId) continue;
		const rows = snapshots
			.filter((snapshot) => snapshot.memoryId === variant.memoryId)
			.sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
		if (rows.length === 0) continue;
		const latest = rows[0];
		const rates = deriveRates(latest);
		const value =
			experiment.primaryMetric === 'click_through_rate'
				? latest.clickThroughRate ?? rates.clickThroughRate
				: experiment.primaryMetric === 'engagement_rate'
					? latest.engagementRate ?? rates.engagementRate
					: experiment.primaryMetric === 'comments'
						? latest.comments
						: experiment.primaryMetric === 'clicks'
							? latest.clicks
							: latest.impressions;
		await store.saveExperimentResult(userId, {
			experimentId: experiment.id,
			variantId: variant.id,
			metric: experiment.primaryMetric,
			absoluteValue: value,
			normalisedValue: value,
			sampleSize: rows.length,
		});
	}

	const results = await store.listExperimentResults(userId, experiment.id);
	const analysis = analyseExperiment({ experiment, results });
	if (analysis.winnerVariantId && analysis.learning) {
		await store.updateExperiment(userId, experiment.id, {
			status: 'completed',
			winnerVariantId: analysis.winnerVariantId,
			confidence: analysis.confidence,
			notes: analysis.reason,
		});
		await store.saveLearning(userId, {
			brandBrainId: experiment.brandBrainId,
			scope: 'experiment',
			channel: undefined,
			observation: analysis.learning,
			metric: experiment.primaryMetric,
			objective: experiment.objective,
			supportingMemoryIds: experiment.variants.map((row) => row.memoryId).filter((id): id is string => Boolean(id)),
			supportingExperimentIds: [experiment.id],
			confidence: analysis.confidence,
			validityStatus: 'active',
			createdAt: new Date().toISOString(),
			lastValidatedAt: new Date().toISOString(),
		});
	} else if (experiment.status === 'ready' || experiment.status === 'draft') {
		await store.updateExperiment(userId, experiment.id, { status: 'measuring' });
	}
	return { experiment: await store.getExperiment(userId, experiment.id), analysis };
}

export function experimentControlChecklist(experiment: Experiment): { ok: boolean; missing: string[] } {
	const missing: string[] = [];
	if (experiment.variants.filter((row) => row.role === 'control').length !== 1) missing.push('one control');
	if (experiment.variants.filter((row) => row.role === 'variant').length < 1) missing.push('one variant');
	if (experiment.variants.some((row) => !row.memoryId)) missing.push('each variant linked to published/scheduled content');
	for (const key of PRAGMATIC_CONTROLS) {
		const missingControl = experiment.variants.some((row) => !row.controls?.[key]);
		if (missingControl) missing.push(key);
	}
	return { ok: missing.length === 0, missing };
}

export function learningLinesForBrief(
	learnings: Array<{ scope: string; confidence: string; observation: string; validityStatus: string; channel?: string }>,
	channel: string,
): string[] {
	return learnings
		.filter((row) => row.validityStatus === 'active' || row.validityStatus === 'decaying')
		.filter((row) => !row.channel || row.channel === channel)
		.slice(0, 8)
		.map((row) => {
			const kind = row.scope === 'experiment' ? 'EXPERIMENT LEARNING' : 'PERFORMANCE LEARNING';
			return `[${kind} / ${row.confidence}] ${row.observation} — observational only; do not treat as causal law.`;
		});
}

export function defaultObjective(value?: string): OptimizationObjective {
	return (value as OptimizationObjective) || 'authority';
}
