import { describe, expect, it } from 'vitest';
import { syncApprovalWithReviewedRevision } from '@/lib/articles/reviewRun';
import type { ArticleRecord } from '@/lib/articles/types';
import { emptyWorkspace } from '@/lib/articles/meta';

describe('approval persistence across media-triggered review', () => {
	it('keeps approval when the reviewed revision is still the approved revision', () => {
		const article = {
			id: 'a1',
			status: 'approved',
			approval: { required: true, approver: 'human', status: 'approved' },
			workspace: {
				...emptyWorkspace(),
				approvedAt: '2026-11-11T00:00:00.000Z',
				approvedRevisionId: 'rev-1',
			},
		} as unknown as ArticleRecord;

		syncApprovalWithReviewedRevision(article, 'rev-1');

		expect(article.approval.status).toBe('approved');
		expect(article.status).toBe('approved');
		expect(article.workspace?.approvedRevisionId).toBe('rev-1');
	});

	it('withdraws approval when a newer body revision is reviewed', () => {
		const article = {
			id: 'a1',
			status: 'approved',
			approval: { required: true, approver: 'human', status: 'approved' },
			workspace: {
				...emptyWorkspace(),
				approvedAt: '2026-11-11T00:00:00.000Z',
				approvedRevisionId: 'rev-1',
			},
		} as unknown as ArticleRecord;

		syncApprovalWithReviewedRevision(article, 'rev-2');

		expect(article.approval.status).toBe('pending');
		expect(article.status).toBe('review');
		expect(article.workspace?.approvedRevisionId).toBeNull();
	});
});
