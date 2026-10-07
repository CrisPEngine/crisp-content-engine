import { describe, expect, it } from 'vitest';
import type { ApprovalRequest } from '../types';
import { nextPendingApproval, pendingApprovalCounts, sortPendingApprovals } from '../approvalInbox';

function request(partial: Partial<ApprovalRequest> & Pick<ApprovalRequest, 'id'>): ApprovalRequest {
	return {
		id: partial.id,
		ownerUserId: 'user-1',
		brandId: 'brand-1',
		credentialId: 'cred-1',
		action: 'approve',
		targetType: 'content',
		targetId: 'content-1',
		summary: partial.summary ?? partial.id,
		preview: { channel: 'instagram', ...(partial.preview ?? {}) },
		consequenceLevel: 2,
		requestedAction: partial.requestedAction ?? 'approve_and_schedule',
		parameters: partial.parameters ?? {},
		parameterHash: 'hash',
		contentHash: 'content-hash',
		status: partial.status ?? 'PENDING',
		tokenHash: `hash-${partial.id}`,
		createdAt: partial.createdAt ?? '2026-10-07T08:00:00.000Z',
		expiresAt: partial.expiresAt ?? '2026-10-08T08:00:00.000Z',
		executionStatus: 'pending',
	};
}

describe('approval inbox ordering', () => {
	it('sorts by soonest publishAt then createdAt', () => {
		const rows = sortPendingApprovals([
			request({
				id: 'later',
				parameters: { publishAt: '2026-10-09T12:00:00.000Z' },
				createdAt: '2026-10-07T09:00:00.000Z',
			}),
			request({
				id: 'sooner',
				parameters: { publishAt: '2026-10-08T15:30:00.000Z' },
				createdAt: '2026-10-07T10:00:00.000Z',
			}),
		]);
		expect(rows.map((r) => r.id)).toEqual(['sooner', 'later']);
	});

	it('excludes expired and non-pending', () => {
		const rows = sortPendingApprovals([
			request({ id: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' }),
			request({ id: 'done', status: 'APPROVED' }),
			request({ id: 'active' }),
		]);
		expect(rows.map((r) => r.id)).toEqual(['active']);
	});

	it('picks next pending excluding current', () => {
		const rows = [
			request({ id: 'a', parameters: { publishAt: '2026-10-08T10:00:00.000Z' } }),
			request({ id: 'b', parameters: { publishAt: '2026-10-08T12:00:00.000Z' } }),
		];
		expect(nextPendingApproval(rows, 'a')?.id).toBe('b');
		const counts = pendingApprovalCounts(rows, 'a');
		expect(counts.othersWaiting).toBe(1);
		expect(counts.next?.id).toBe('b');
	});
});
