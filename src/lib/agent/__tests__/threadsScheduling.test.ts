import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveApprovalRequest } from '@/lib/agent/approvals';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';

const { syncAgentThreadsPublishJob, cancelAgentThreadsPublishJob } = vi.hoisted(() => ({
	syncAgentThreadsPublishJob: vi.fn(async () => ({ armed: true })),
	cancelAgentThreadsPublishJob: vi.fn(),
}));

vi.mock('@/lib/publish/agentThreadsJob', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/lib/publish/agentThreadsJob')>();
	return {
		...actual,
		syncAgentThreadsPublishJob,
		cancelAgentThreadsPublishJob,
	};
});

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload, idempotencyKey });
}

describe('Threads agent scheduling', () => {
	let folianId = '';
	let folianSecret = '';

	beforeEach(async () => {
		syncAgentThreadsPublishJob.mockClear();
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

	it('queues a publish job when a human approves approve_and_schedule for Threads', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'threads',
			body: 'Threads copy',
			publicationStatus: 'review',
		});
		const created = await call(
			folianSecret,
			'cce_create_approval_request',
			{ brandId: folianId, contentId: draft.id, requestedAction: 'approve_and_schedule', publishAt: '2026-10-06T05:25:00.000Z' },
			'threads-approval',
		);
		const approvalUrl = (created.body.result as { approvalUrl: string }).approvalUrl;
		const token = approvalUrl.split('/').pop() ?? '';
		await resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' });
		expect(syncAgentThreadsPublishJob).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: FOLIAN_USER_ID,
				publishAt: '2026-10-06T05:25:00.000Z',
			}),
		);
	});

	it('blocks approval when Threads copy exceeds 500 characters', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'threads',
			body: 't'.repeat(668),
			publicationStatus: 'draft',
		});
		const submitted = await call(
			folianSecret,
			'cce_submit_for_approval',
			{ brandId: folianId, contentId: draft.id },
			'threads-too-long-submit',
		);
		expect(submitted.body.error?.code).toBe('content_channel_constraint');
		expect(submitted.body.error?.message).toMatch(/500 characters or fewer/);
	});

	it('reports publisherArmed after schedule_content for Threads', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'threads',
			body: 'Threads copy',
			publicationStatus: 'review',
		});
		const created = await call(
			folianSecret,
			'cce_create_approval_request',
			{ brandId: folianId, contentId: draft.id, requestedAction: 'approve_content' },
			'threads-approve-then-schedule',
		);
		const approvalUrl = (created.body.result as { approvalUrl: string }).approvalUrl;
		await resolveApprovalRequest({ token: approvalUrl.split('/').pop() ?? '', userId: FOLIAN_USER_ID, decision: 'approve' });
		syncAgentThreadsPublishJob.mockClear();
		const scheduled = await call(
			folianSecret,
			'cce_schedule_content',
			{ brandId: folianId, contentId: draft.id, publishAt: '2026-10-07T12:00:00.000Z' },
			'schedule-threads',
		);
		expect(scheduled.body.ok).toBe(true);
		expect((scheduled.body.result as { publisherArmed: boolean }).publisherArmed).toBe(true);
		expect(syncAgentThreadsPublishJob).toHaveBeenCalled();
	});
});
