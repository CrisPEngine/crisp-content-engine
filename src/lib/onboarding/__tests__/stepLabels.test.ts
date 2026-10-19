import { describe, expect, it } from 'vitest';
import { humanStepLabel } from '../stepLabels';

describe('humanStepLabel', () => {
	it('maps known step ids to plain language', () => {
		expect(humanStepLabel('approve_strategy')).toContain('Approve');
		expect(humanStepLabel('generate_content')).toContain('Generate');
	});

	it('never returns raw slug ids for dashboard steps', () => {
		expect(humanStepLabel('connect_social')).not.toBe('connect_social');
		expect(humanStepLabel('review_content')).not.toBe('review_content');
	});

	it('title-cases unknown ids instead of showing underscores', () => {
		const label = humanStepLabel('some-new-step-id');
		expect(label).not.toContain('_');
		expect(label).toContain('Some');
	});
});
