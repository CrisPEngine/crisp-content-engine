import { describe, expect, it } from 'vitest';
import { analyseExperiment } from '../experiments';
import { applyDecay } from '../performance';
import type { ContentLearning, Experiment } from '../types';

describe('experiments', () => {
	const experiment: Experiment = {
		id: 'exp-1',
		brandBrainId: 'brain',
		title: 'Hook style',
		hypothesis: 'Problem-led hooks outperform generic thought-leadership hooks',
		variable: 'hook_style',
		primaryMetric: 'click_through_rate',
		secondaryMetrics: ['comments'],
		objective: 'website_traffic',
		status: 'running',
		minimumSample: 4,
		measurementWindowHours: 72,
		confidence: 'insufficient',
		variants: [
			{ id: 'c', experimentId: 'exp-1', role: 'control', label: 'Generic TL', controls: { same_channel: 'required' } },
			{ id: 'v', experimentId: 'exp-1', role: 'variant', label: 'Problem-led', controls: { same_channel: 'required' } },
		],
	};

	it('refuses to crown a winner on tiny samples or tiny differences', () => {
		const tiny = analyseExperiment({
			experiment,
			results: [
				{ variantId: 'c', metric: 'click_through_rate', normalisedValue: 0.02, sampleSize: 1 },
				{ variantId: 'v', metric: 'click_through_rate', normalisedValue: 0.021, sampleSize: 1 },
			],
		});
		expect(tiny.ready).toBe(false);
		expect(tiny.winnerVariantId).toBeUndefined();
	});

	it('identifies a likely winner with explicit non-causal confidence', () => {
		const ready = analyseExperiment({
			experiment,
			results: [
				{ variantId: 'c', metric: 'click_through_rate', normalisedValue: 0.01, sampleSize: 6 },
				{ variantId: 'v', metric: 'click_through_rate', normalisedValue: 0.03, sampleSize: 6 },
			],
		});
		expect(ready.winnerVariantId).toBe('v');
		expect(ready.reason).toMatch(/not causal/i);
	});
});

describe('learning decay', () => {
	it('marks old learnings as retest candidates', () => {
		const learning: ContentLearning = {
			id: 'l1',
			brandBrainId: 'brain',
			scope: 'brand',
			observation: 'Tuesday posts outperform Friday posts',
			supportingMemoryIds: [],
			supportingExperimentIds: [],
			confidence: 'moderate',
			validityStatus: 'active',
			createdAt: '2025-01-01T00:00:00.000Z',
		};
		const [decayed] = applyDecay([learning], new Date('2026-08-31T00:00:00.000Z'));
		expect(decayed.validityStatus).toBe('retest_candidate');
	});
});
