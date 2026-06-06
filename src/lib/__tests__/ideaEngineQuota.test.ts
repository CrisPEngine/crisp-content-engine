import { describe, expect, it } from 'vitest';
import { IDEA_ENGINE_RUN_MAX_TOTAL } from '@/lib/ideaEngineLimits';
import { computeIdeaEngineRequestedCounts } from '@/lib/ideaEngineQuota';

const fullQuota = {
	linkedin: 10,
	x: 10,
	blog: 10,
	meta_pool: 10,
};

describe('computeIdeaEngineRequestedCounts', () => {
	it('applies default series counts for LinkedIn, X, and Blog', () => {
		const { requestedCounts, totalItems } = computeIdeaEngineRequestedCounts(
			['LinkedIn', 'X', 'Blog'],
			'growth',
			fullQuota,
		);
		expect(requestedCounts).toEqual({ LinkedIn: 1, X: 3, Blog: 1 });
		expect(totalItems).toBe(5);
	});

	it('allocates one Meta item when only Instagram is selected', () => {
		const { requestedCounts } = computeIdeaEngineRequestedCounts(
			['LinkedIn', 'X', 'Blog', 'Instagram'],
			'growth',
			fullQuota,
		);
		expect(requestedCounts.Instagram).toBe(1);
		expect(requestedCounts.Facebook).toBeUndefined();
	});

	it('allocates one per platform when both Meta channels are explicitly selected', () => {
		const { requestedCounts } = computeIdeaEngineRequestedCounts(
			['LinkedIn', 'Instagram', 'Facebook'],
			'growth',
			fullQuota,
		);
		expect(requestedCounts.Instagram).toBe(1);
		expect(requestedCounts.Facebook).toBe(1);
	});

	it('never exceeds total run cap of 7', () => {
		const { requestedCounts, totalItems } = computeIdeaEngineRequestedCounts(
			['LinkedIn', 'X', 'Blog', 'Instagram', 'Facebook'],
			'growth',
			fullQuota,
		);
		expect(totalItems).toBeLessThanOrEqual(IDEA_ENGINE_RUN_MAX_TOTAL);
		expect(Object.values(requestedCounts).reduce((s, n) => s + n, 0)).toBe(totalItems);
	});

	it('drops Meta on creator plan', () => {
		const { requestedCounts, droppedChannels } = computeIdeaEngineRequestedCounts(
			['LinkedIn', 'X', 'Instagram'],
			'creator',
			fullQuota,
		);
		expect(requestedCounts.Instagram).toBeUndefined();
		expect(droppedChannels).toContain('Instagram');
	});
});
