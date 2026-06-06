import { describe, expect, it } from 'vitest';
import { resolveReviewStatusFromCounts } from '../persistence/runStatus';

describe('resolveReviewStatusFromCounts', () => {
	it('returns failed when nothing is ready', () => {
		expect(resolveReviewStatusFromCounts({ ready: 0, failed: 2 }, false)).toBe('failed');
	});

	it('returns review when all generated items succeeded', () => {
		expect(resolveReviewStatusFromCounts({ ready: 2, failed: 0 }, false)).toBe('review');
	});

	it('returns review_with_errors when some channels failed', () => {
		expect(resolveReviewStatusFromCounts({ ready: 1, failed: 3 }, false)).toBe(
			'review_with_errors',
		);
	});

	it('returns review_with_errors when channel errors reported without failed rows yet', () => {
		expect(resolveReviewStatusFromCounts({ ready: 1, failed: 0 }, true)).toBe(
			'review_with_errors',
		);
	});
});
