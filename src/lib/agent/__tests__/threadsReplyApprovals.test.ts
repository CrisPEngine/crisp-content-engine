import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { fingerprintReplyDraft } from '@/lib/threads/replyFingerprint';

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload, idempotencyKey });
}

describe('Threads reply approvals', () => {
	let folianId = '';
	let folianSecret = '';

	beforeEach(async () => {
		setAgentStoreForTests(createMemoryAgentStore());
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const folian = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolian', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		folianId = folian.id;
		folianSecret = (
			await issueAgentCredential({
				name: 'Folian Marketing Grok',
				ownerUserId: FOLIAN_USER_ID,
				allowedBrandIds: [folian.id],
				capabilities: FOLIAN_GROK_CAPABILITIES,
				scope: 'BRAND',
				environment: 'test',
				rateLimit: FOLIAN_GROK_RATE_LIMIT,
			})
		).secret;
	});

	afterEach(() => {
		setAgentStoreForTests(undefined);
		setIntelligenceStoreForTests(undefined);
		vi.restoreAllMocks();
	});

	it('creates an approval request with a stable reply fingerprint', async () => {
		const draft = await call(
			folianSecret,
			'cce_draft_reply',
			{
				brandId: folianId,
				text: 'Thanks for sharing this.',
				targetUrl: 'https://www.threads.net/@someone/post/Ab',
				originalAuthorHandle: 'someone',
				originalPostExcerpt: 'Original post text',
			},
			'draft-1',
		);
		expect(draft.body.ok).toBe(true);
		const interactionId = (draft.body.result as { interactionId: string }).interactionId;

		const approval = await call(
			folianSecret,
			'cce_request_reply_approval',
			{ brandId: folianId, interactionId },
			'approval-reply-1',
		);
		expect(approval.body.ok).toBe(true);
		const approvalUrl = (approval.body.result as { approvalUrl: string }).approvalUrl;
		const token = approvalUrl.split('/').pop() ?? '';

		vi.spyOn(await import('@/lib/threads/publishReply'), 'publishApprovedThreadsReply').mockResolvedValue({
			success: true,
			replyPostId: '777',
			permalink: 'https://www.threads.net/@folian/post/777',
		});

		await resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' });

		const inbox = await call(folianSecret, 'cce_get_engagement_inbox', { brandId: folianId });
		const rows = (inbox.body.result as { interactions: Array<{ id: string; responseStatus: string; publishedReplyId?: string }> }).interactions;
		const row = rows.find((r) => r.id === interactionId);
		expect(row?.responseStatus).toBe('published');
		expect(row?.publishedReplyId).toBe('777');
	});

	it('blocks duplicate replies to the same media id', async () => {
		const first = await call(
			folianSecret,
			'cce_draft_reply',
			{ brandId: folianId, text: 'First', externalPostId: '12345' },
			'dup-1',
		);
		const interactionId = (first.body.result as { interactionId: string }).interactionId;
		await call(folianSecret, 'cce_request_reply_approval', { brandId: folianId, interactionId }, 'dup-approval-1');

		const second = await call(
			folianSecret,
			'cce_draft_reply',
			{ brandId: folianId, text: 'Second', externalPostId: '12345' },
			'dup-2',
		);
		const secondId = (second.body.result as { interactionId: string }).interactionId;
		const blocked = await call(folianSecret, 'cce_request_reply_approval', { brandId: folianId, interactionId: secondId }, 'dup-approval-2');
		expect(blocked.body.error?.code).toBe('duplicate_threads_reply');
	});

	it('fingerprints reply text and target together', () => {
		const a = fingerprintReplyDraft({
			draftReply: 'Hello',
			resolvedMediaId: '1',
			targetUrl: 'https://www.threads.net/@a/post/X',
		});
		const b = fingerprintReplyDraft({
			draftReply: 'Hello!',
			resolvedMediaId: '1',
			targetUrl: 'https://www.threads.net/@a/post/X',
		});
		expect(a).not.toBe(b);
	});
});
