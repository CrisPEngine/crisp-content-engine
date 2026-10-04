import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApprovalRequest, resolveApprovalRequest } from '@/lib/agent/approvals';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { CHIEF_OF_STAFF_CAPABILITIES, CHIEF_OF_STAFF_DENIED, FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';
import { planMedia } from '@/lib/media/planner';
import { createMemoryNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { PublicAsset } from '@/lib/media/types';

const OTHER_USER = '00000000-0000-4000-8000-000000000099';

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload, idempotencyKey });
}

describe('account scope, assets, and human approval', () => {
	let folianId = '';
	let crispId = '';
	let folianSecret = '';
	let ownerSecret = '';

	beforeEach(async () => {
		setAgentStoreForTests(createMemoryAgentStore());
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const folian = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolian', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		const crisp = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recCrisp', {
			identity: { ...folianIdentity, name: 'CrisP Digital' },
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		await store.upsertBrandBrain(OTHER_USER, 'recStranger', {
			identity: { ...folianIdentity, name: 'Someone Else' },
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		folianId = folian.id;
		crispId = crisp.id;
		folianSecret = (await issueAgentCredential({
			name: 'Folian Marketing Grok',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [folian.id],
			capabilities: FOLIAN_GROK_CAPABILITIES,
			scope: 'BRAND',
			environment: 'test',
			rateLimit: FOLIAN_GROK_RATE_LIMIT,
		})).secret;
		ownerSecret = (await issueAgentCredential({
			name: 'Chris Marketing Chief of Staff',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [],
			capabilities: CHIEF_OF_STAFF_CAPABILITIES,
			scope: 'OWNER_ACCOUNT',
			environment: 'test',
			rateLimit: FOLIAN_GROK_RATE_LIMIT,
		})).secret;
	});

	afterEach(() => {
		setAgentStoreForTests(undefined);
		setIntelligenceStoreForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('lets an owner credential discover owned brands and keeps a brand credential narrow', async () => {
		expect(CHIEF_OF_STAFF_DENIED.every((capability) => !CHIEF_OF_STAFF_CAPABILITIES.includes(capability))).toBe(true);
		const listed = await call(ownerSecret, 'cce_list_brands');
		const names = ((listed.body.result as { brands: Array<{ name: string }> }).brands).map((brand) => brand.name).sort();
		expect(names).toEqual(['CrisP Digital', 'Folian']);
		expect(JSON.stringify(listed.body)).not.toContain('Someone Else');
		const crisp = await call(ownerSecret, 'cce_get_brand', { brandId: crispId });
		expect(crisp.body.ok).toBe(true);
		const folian = await call(folianSecret, 'cce_get_brand', { brandId: folianId });
		expect(folian.body.ok).toBe(true);
		const denied = await call(folianSecret, 'cce_get_brand', { brandId: crispId });
		expect(denied.body.error?.code).toBe('brand_not_accessible');
		const stranger = await call(ownerSecret, 'cce_list_brands');
		expect(JSON.stringify(stranger.body)).not.toContain('token');
	});

	it('requires a human approval page and then allows scheduling only that item', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'linkedin',
			topic: 'Authors control canon',
			body: 'The author decides which facts enter canon.',
			publicationStatus: 'draft',
		});
		const other = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'linkedin',
			topic: 'A different post',
			body: 'This one was not approved.',
			publicationStatus: 'draft',
		});
		const direct = await call(folianSecret, 'cce_approve_content', { brandId: folianId, contentId: draft.id }, 'approve-direct');
		expect(direct.body.error?.code).toBe('capability_not_enabled');
		const created = await call(folianSecret, 'cce_create_approval_request', { brandId: folianId, contentId: draft.id, requestedAction: 'approve_content' }, 'approval-1');
		expect(created.body.ok).toBe(true);
		const approvalId = (created.body.result as { id: string; approvalUrl: string }).id;
		const approvalUrl = (created.body.result as { approvalUrl: string }).approvalUrl;
		const token = approvalUrl.split('/').pop() ?? '';
		const pending = await call(folianSecret, 'cce_get_approval_request', { brandId: folianId, approvalId });
		expect((pending.body.result as { status: string }).status).toBe('PENDING');
		const forged = await call(folianSecret, 'cce_resolve_approval_request', { brandId: folianId, approvalId, approved: true }, 'resolve-forged');
		expect(forged.body.error?.code).toBe('human_authorization_required');
		await expect(resolveApprovalRequest({ token, userId: OTHER_USER, decision: 'approve' })).rejects.toMatchObject({ code: 'approval_not_authorized' });
		const approved = await resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' });
		expect(approved.status).toBe('APPROVED');
		expect(approved.resolvedBy).toBe(FOLIAN_USER_ID);
		await expect(resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' })).rejects.toMatchObject({ code: 'approval_already_resolved' });
		const saved = await store.getMemory(FOLIAN_USER_ID, draft.id);
		expect(saved?.publicationStatus).toBe('approved');
		expect(saved?.publicationStatus).not.toBe('published');
		const scheduled = await call(folianSecret, 'cce_schedule_content', { brandId: folianId, contentId: draft.id, publishAt: '2026-10-06T05:30:00.000Z' }, 'schedule-1');
		expect(scheduled.body.ok).toBe(true);
		expect((scheduled.body.result as { content: { status: string } }).content.status).toBe('scheduled');
		const blocked = await call(folianSecret, 'cce_schedule_content', { brandId: folianId, contentId: other.id, publishAt: '2026-10-06T05:30:00.000Z' }, 'schedule-other');
		expect(blocked.body.error?.code).toBe('content_not_approved');
	});

	it('expires, rejects changed content, and does not publish', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const agentStore = (await import('@/lib/agent/controlStore')).getAgentStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: folianId,
			channel: 'linkedin',
			topic: 'Canon',
			body: 'Original body',
			publicationStatus: 'draft',
		});
		const created = await createApprovalRequest({
			credential: { id: 'cred', ownerUserId: FOLIAN_USER_ID, scope: 'BRAND', allowedBrandIds: [folianId], name: 'test', capabilities: FOLIAN_GROK_CAPABILITIES, environment: 'test', keyHash: 'x', keyPrefix: 'cce_agent_test', rateLimit: FOLIAN_GROK_RATE_LIMIT, createdAt: new Date().toISOString() },
			brandId: folianId,
			targetType: 'content',
			targetId: draft.id,
			requestedAction: 'approve_content',
		});
		const token = created.approvalUrl.split('/').pop() ?? '';
		created.request.expiresAt = new Date(Date.now() - 1000).toISOString();
		await agentStore.saveApprovalRequest(created.request);
		await expect(resolveApprovalRequest({ token, userId: FOLIAN_USER_ID, decision: 'approve' })).rejects.toMatchObject({ code: 'approval_expired' });
		const fresh = await createApprovalRequest({
			credential: { id: 'cred', ownerUserId: FOLIAN_USER_ID, scope: 'BRAND', allowedBrandIds: [folianId], name: 'test', capabilities: FOLIAN_GROK_CAPABILITIES, environment: 'test', keyHash: 'x', keyPrefix: 'cce_agent_test', rateLimit: FOLIAN_GROK_RATE_LIMIT, createdAt: new Date().toISOString() },
			brandId: folianId,
			targetType: 'content',
			targetId: draft.id,
			requestedAction: 'approve_content',
		});
		await store.saveMemory(FOLIAN_USER_ID, { ...draft, body: 'Changed after the request' });
		const changedToken = fresh.approvalUrl.split('/').pop() ?? '';
		await expect(resolveApprovalRequest({ token: changedToken, userId: FOLIAN_USER_ID, decision: 'approve' })).rejects.toMatchObject({ code: 'content_changed' });
		const still = await store.getMemory(FOLIAN_USER_ID, draft.id);
		expect(still?.publicationStatus).toBe('draft');
	});

	it('considers a verified Folian screenshot before generating', async () => {
		const screenshot: PublicAsset = {
			id: 'shot-1',
			brandId: folianId,
			assetType: 'image',
			sourceType: 'upload',
			title: 'Folian canon view',
			description: 'Proposed fact awaiting approval',
			productFeature: 'canon',
			libraryType: 'PRODUCT_SCREENSHOT',
			verifiedReference: true,
			referenceAllowed: true,
			approvalStatus: 'approved',
		};
		const linkedin = planMedia({ channel: 'LINKEDIN_PERSONAL', topic: 'Why authors should control what enters canon', assets: [screenshot] });
		expect(linkedin.mediaChoice).toBe('existing');
		expect(linkedin.existingAssetId).toBe('shot-1');
		expect(linkedin.mediaRequired).toBe(false);
		const instagram = planMedia({ channel: 'INSTAGRAM_FEED', topic: 'Why authors should control what enters canon', assets: [screenshot] });
		expect(instagram.preferredSource).toBe('existing');
		expect(instagram.mediaRequired).toBe(true);
		const unverified = planMedia({ channel: 'INSTAGRAM_FEED', topic: 'Why authors should control what enters canon', assets: [{ ...screenshot, verifiedReference: false }] });
		expect(unverified.mediaChoice).toBe('generate');
		expect(unverified.existingAssetId).toBeNull();
		const reference = planMedia({
			channel: 'INSTAGRAM_FEED',
			topic: 'Why authors should control what enters canon',
			assets: [{ ...screenshot, libraryType: 'BRAND_REFERENCE' }],
		});
		expect(reference.mediaChoice).toBe('reference');
		expect(reference.referenceAssetIds).toEqual(['shot-1']);
		const plain = planMedia({ channel: 'LINKEDIN_PERSONAL', topic: 'A general argument about patience' });
		expect(plain.mediaChoice).toBeUndefined();
		expect(plain.preferredSource).toBe('none');
	});
});
