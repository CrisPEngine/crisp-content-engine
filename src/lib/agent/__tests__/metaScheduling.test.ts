import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';

const { syncAgentMetaPublishJob } = vi.hoisted(() => ({
	syncAgentMetaPublishJob: vi.fn(async () => ({ armed: true, platform: 'instagram' as const })),
}));

vi.mock('@/lib/publish/agentMetaJob', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/publish/agentMetaJob')>();
	return {
		...actual,
		syncAgentMetaPublishJob,
	};
});

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload, idempotencyKey });
}

describe('Meta agent scheduling', () => {
	let folianId = '';
	let folianSecret = '';

	beforeEach(async () => {
		syncAgentMetaPublishJob.mockClear();
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
	});

	it('queues a publish job when a human approves approve_and_schedule for Instagram', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'instagram',
			body: 'Instagram copy',
			publicationStatus: 'review',
		});
		const created = await call(
			folianSecret,
			'cce_create_approval_request',
			{ brandId: folianId, contentId: draft.id, requestedAction: 'approve_and_schedule', publishAt: '2026-10-08T15:30:00.000Z' },
			'ig-approval',
		);
		const approvalUrl = (created.body.result as { approvalUrl: string }).approvalUrl;
		const token = approvalUrl.split('/').pop() ?? '';
		await resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' });
		expect(syncAgentMetaPublishJob).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: FOLIAN_USER_ID,
				publishAt: '2026-10-08T15:30:00.000Z',
			}),
		);
	});
});
