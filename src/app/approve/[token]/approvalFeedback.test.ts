import { describe, expect, it } from 'vitest';
import {
	approvalPendingLabel,
	approvalSubmitLabel,
	approvalSuccessDetail,
	approvalSuccessHeadline,
} from './approvalFeedback';

describe('approvalFeedback labels', () => {
	it('uses schedule-aware approve labels', () => {
		expect(approvalSubmitLabel('approve', false)).toBe('Approve');
		expect(approvalSubmitLabel('approve', true)).toBe('Approve and schedule');
		expect(approvalPendingLabel('approve', false)).toBe('Approving…');
		expect(approvalPendingLabel('approve', true)).toBe('Approving and scheduling…');
	});

	it('uses reject labels', () => {
		expect(approvalSubmitLabel('reject', false)).toBe('Reject');
		expect(approvalPendingLabel('reject', true)).toBe('Rejecting…');
	});

	it('builds success copy from decision', () => {
		expect(approvalSuccessHeadline('approve', false)).toBe('Approved');
		expect(approvalSuccessHeadline('approve', true)).toBe('Approved and scheduled');
		expect(approvalSuccessHeadline('reject', false)).toBe('Request rejected');
		expect(approvalSuccessDetail('reject')).toContain('will not be published');
	});
});
