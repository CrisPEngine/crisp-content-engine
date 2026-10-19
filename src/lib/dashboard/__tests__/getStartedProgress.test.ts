import { describe, expect, it } from 'vitest';
import { computeGetStartedCurrentStep, computeGetStartedStepDone } from '../getStartedProgress';

describe('getStartedProgress', () => {
	it('never recommends review step when selected brand has zero pending drafts', () => {
		const step = computeGetStartedCurrentStep({
			strategyApproved: true,
			phase: 'active',
			pendingNative: 0,
			assetCount: 0,
			connected: 1,
		});
		expect(step).toBe(3);
	});

	it('marks later steps not done when strategy is incomplete', () => {
		const done = computeGetStartedStepDone({
			strategyApproved: false,
			phase: 'skeleton',
			pendingNative: 5,
			assetCount: 0,
			connected: 3,
		});
		expect(done.approve_strategy).toBe(false);
		expect(done.generate_content).toBe(false);
		expect(done.connect_social).toBe(false);
		expect(done.review_content).toBe(false);
	});

	it('uses step 5 when pending approvals exist for the brand', () => {
		const step = computeGetStartedCurrentStep({
			strategyApproved: true,
			phase: 'active',
			pendingNative: 3,
			assetCount: 1,
			connected: 0,
		});
		expect(step).toBe(5);
	});
});
