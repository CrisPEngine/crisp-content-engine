import { describe, expect, it, vi, beforeEach } from 'vitest';
import { updatePendingApprovalFromToken } from '../approvalEdit';
import type { ApprovalRequest } from '../types';

const saveMemory = vi.fn();
const saveApprovalRequest = vi.fn();
const getMemory = vi.fn();

vi.mock('@/lib/intelligence/actions', () => ({
	getIntelligenceStore: () => ({
		getMemory,
		saveMemory,
	}),
}));

vi.mock('@/lib/media/store', () => ({
	getNativeContentStore: () => ({
		getArticle: vi.fn(),
		saveArticle: vi.fn(),
	}),
}));

const pendingRequest: ApprovalRequest = {
	id: 'req-1',
	ownerUserId: 'user-1',
	brandId: 'brand-1',
	credentialId: 'cred-1',
	action: 'approve_and_schedule',
	targetType: 'content',
	targetId: 'mem-1',
	summary: 'Test',
	preview: { body: 'Hello', channel: 'threads', publishAt: '2030-01-01T08:00:00.000Z' },
	consequenceLevel: 2,
	requestedAction: 'approve_and_schedule',
	parameters: { publishAt: '2030-01-01T08:00:00.000Z', requestedAction: 'approve_and_schedule', targetType: 'content', targetId: 'mem-1' },
	parameterHash: 'hash',
	contentHash: 'old-hash',
	status: 'PENDING',
	tokenHash: '23fb79e20d37abf2418d78115eb0cc8c74b52f4ed8b91dda7fc03a1d41fc15e3',
	createdAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 86400000).toISOString(),
	executionStatus: 'pending',
};

vi.mock('../controlStore', () => ({
	getAgentStore: () => ({
		getApprovalRequestByTokenHash: vi.fn(async (hash: string) =>
			hash === '23fb79e20d37abf2418d78115eb0cc8c74b52f4ed8b91dda7fc03a1d41fc15e3' ? pendingRequest : null,
		),
		saveApprovalRequest,
	}),
}));

describe('updatePendingApprovalFromToken', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getMemory.mockResolvedValue({
			id: 'mem-1',
			brandBrainId: 'brand-1',
			channel: 'threads',
			contentType: 'founder_post',
			body: 'Hello',
			hook: 'Hook',
			cta: 'Learn more',
			publicationStatus: 'draft',
		});
	});

	it('preserves em dashes in human edits', async () => {
		const body = 'One — two';
		await updatePendingApprovalFromToken({
			token: 'plain-token',
			userId: 'user-1',
			edit: { body, title: 'Title', cta: 'Go' },
		});
		expect(saveMemory).toHaveBeenCalled();
		const saved = saveMemory.mock.calls[0][1];
		expect(saved.body).toBe(body);
		expect(saveApprovalRequest).toHaveBeenCalled();
	});
});
