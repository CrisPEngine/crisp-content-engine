import { describe, expect, it } from 'vitest';
import {
	approvalPendingLabel,
	approvalSubmitLabel,
	approvalSuccessDetail,
	approvalSuccessHeadline,
} from './approvalFeedback';

describe('approvalFeedback labels', () => {
	it('uses schedule-aware approve labels', () => {
		expect(approvalSubmitLabel('approve', 'content')).toBe('Approve');
		expect(approvalSubmitLabel('approve', 'schedule')).toBe('Approve and schedule');
		expect(approvalPendingLabel('approve', 'content')).toBe('Approving…');
		expect(approvalPendingLabel('approve', 'schedule')).toBe('Approving and scheduling…');
	});

	it('uses threads reply labels', () => {
		expect(approvalSubmitLabel('approve', 'threads_reply')).toBe('Approve & post');
		expect(approvalPendingLabel('approve', 'threads_reply')).toBe('Posting reply…');
	});

	it('uses reject labels', () => {
		expect(approvalSubmitLabel('reject', 'content')).toBe('Reject');
		expect(approvalPendingLabel('reject', 'schedule')).toBe('Rejecting…');
	});

	it('builds success copy from decision', () => {
		expect(approvalSuccessHeadline('approve', 'content')).toBe('Approved');
		expect(approvalSuccessHeadline('approve', 'schedule')).toBe('Approved and scheduled');
		expect(approvalSuccessHeadline('approve', 'threads_reply')).toBe('Reply posted');
		expect(approvalSuccessHeadline('reject', 'content')).toBe('Request rejected');
		expect(approvalSuccessDetail('reject', 'content')).toContain('will not be published');
	});
});
