import { describe, expect, it } from 'vitest';
import { assertStrategyReadyForContent, scoreStrategyCompleteness } from '../strategyCompleteness';
import type { BrandStrategy } from '../../types';

function baseStrategy(overrides: Partial<BrandStrategy> = {}): BrandStrategy {
	return {
		id: 's1',
		userId: 'u1',
		brandBrainId: 'b1',
		airtableBrandId: 'rec1',
		status: 'active',
		objectives: ['Grow awareness'],
		audiences: [{ name: 'Buyers', description: 'Operations leaders at mid-size manufacturers' }],
		audienceProblems: ['Slow production cycles', 'Quality drift'],
		desiredOutcomes: ['More qualified leads'],
		positioning: 'Premium die-cast components with tighter tolerances than commodity suppliers',
		keyMessages: ['Precision matters'],
		proofPoints: ['ISO certified'],
		contentPillars: ['Precision engineering', 'Customer stories', 'Process transparency'],
		funnelStages: ['awareness'],
		ctaStrategy: {},
		contentMix: {},
		editorialThemes: ['Behind the line', 'Tolerance deep dives'],
		campaigns: [],
		channelStrategies: [{ id: 'c1', strategyId: 's1', channel: 'linkedin', formats: [], constraints: [], cadence: '3 posts per week' }],
		...overrides,
	};
}

describe('strategyCompleteness', () => {
	it('flags skeleton pillars from onboarding placeholders', () => {
		const result = scoreStrategyCompleteness(
			baseStrategy({
				status: 'draft',
				contentPillars: ['LinkedIn content', 'Blog content'],
				audienceProblems: [],
				editorialThemes: [],
				channelStrategies: [],
			}),
		);
		expect(result.isSkeleton).toBe(true);
		expect(result.complete).toBe(false);
	});

	it('blocks content when strategy is not active', () => {
		const gate = assertStrategyReadyForContent(baseStrategy({ status: 'draft' }));
		expect(gate.ok).toBe(false);
		if (!gate.ok) expect(gate.code).toBe('strategy_not_active');
	});

	it('allows content for active complete strategy', () => {
		const gate = assertStrategyReadyForContent(baseStrategy());
		expect(gate.ok).toBe(true);
	});
});
