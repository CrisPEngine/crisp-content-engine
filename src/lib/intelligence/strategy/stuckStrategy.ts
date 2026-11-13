import type { BrandStrategy } from '../types';

const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

export function stuckStrategyRecovery(strategy: BrandStrategy, now = Date.now()): BrandStrategy | null {
	if (strategy.generationMetadata?.phase !== 'generating') return null;
	const started = strategy.generationMetadata.startedAt ? Date.parse(strategy.generationMetadata.startedAt) : Number.NaN;
	if (Number.isFinite(started) && now - started < STUCK_AFTER_MS) return null;
	return {
		...strategy,
		generationMetadata: {
			...strategy.generationMetadata,
			phase: 'failed',
			error: 'Generation did not finish. Objectives, pillars, and status were left unchanged. Airtable strategy was not modified.',
			completedAt: new Date(now).toISOString(),
		},
	};
}
