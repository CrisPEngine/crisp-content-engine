import { beforeEach, describe, expect, it } from 'vitest';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import { FOLIAN_USER_ID, folianGuardrails, folianIdentity, folianKnowledge, folianVoice } from '@/lib/intelligence/__tests__/folianFixture';

async function call(secret: string, action: string, payload: Record<string, unknown> = {}) {
	return executeFromAuthorization({ authorization: `Bearer ${secret}`, action, payload });
}

describe('cce_update_draft_text', () => {
	let secret = '';
	let brandId = '';

	beforeEach(async () => {
		setAgentStoreForTests(createMemoryAgentStore());
		const store = createMemoryIntelligenceStore();
		setIntelligenceStoreForTests(store);
		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recFolian', {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		brandId = brain.id;
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = brain.id;
		secret = (
			await issueAgentCredential({
				name: 'test',
				ownerUserId: FOLIAN_USER_ID,
				allowedBrandIds: [brain.id],
				capabilities: FOLIAN_GROK_CAPABILITIES,
				scope: 'BRAND',
				environment: 'test',
				rateLimit: FOLIAN_GROK_RATE_LIMIT,
			})
		).secret;
	});

	it('updates draft text while in review and blocks published content', async () => {
		const store = (await import('@/lib/intelligence/actions')).getIntelligenceStore();
		const draft = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: brandId,
			channel: 'threads',
			body: 'Old copy.',
			publicationStatus: 'review',
		});
		const updated = await call(secret, 'cce_update_draft_text', {
			brandId,
			contentId: draft.id,
			body: 'New Threads copy. How do you track canon? #Folian',
		});
		expect(updated.body.ok).toBe(true);
		expect((updated.body.result as { body: string }).body).toContain('#Folian');

		await store.saveMemory(FOLIAN_USER_ID, { ...draft, publicationStatus: 'published' });
		const blocked = await call(secret, 'cce_update_draft_text', {
			brandId,
			contentId: draft.id,
			body: 'Should not save.',
		});
		expect(blocked.body.error?.code).toBe('content_not_editable');
	});
});
