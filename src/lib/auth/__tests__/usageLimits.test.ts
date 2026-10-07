import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setPlatformSuperAdminOverrideForTests } from '@/lib/auth/platformAdmin';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { FOLIAN_GROK_CAPABILITIES } from '@/lib/agent/policy';
import { enforceCaps } from '@/lib/enforceCaps';
import { enforceIntelligenceRateLimit, resetIntelligenceActorStateForTests, type IntelligenceActor } from '@/lib/intelligence/actors';
import { FOLIAN_USER_ID } from '@/lib/intelligence/__tests__/folianFixture';

describe('platform super admin usage limits', () => {
	const agents = createMemoryAgentStore();

	beforeEach(() => {
		setAgentStoreForTests(agents);
		resetIntelligenceActorStateForTests();
		setPlatformSuperAdminOverrideForTests(null);
	});

	afterEach(() => {
		setPlatformSuperAdminOverrideForTests(null);
	});

	it('lets super admin owners bypass agent action and request rate buckets', async () => {
		setPlatformSuperAdminOverrideForTests(FOLIAN_USER_ID, true);
		const { secret } = await issueAgentCredential({
			name: 'Admin owner',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: ['brand-1'],
			capabilities: FOLIAN_GROK_CAPABILITIES,
			environment: 'test',
			rateLimit: {
				requestsPerHour: 1,
				generationsPerDay: 1,
				researchRequestsPerDay: 1,
				publishActionsPerDay: 1,
				adProposalsPerDay: 1,
				imagesPerDay: 1,
			},
		});

		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_get_capabilities', payload: {} })).body.ok).toBe(true);
		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_get_capabilities', payload: {} })).body.ok).toBe(true);
		const researchPayload = { brandId: 'brand-1', query: 'topic one' };
		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_research_topic', payload: researchPayload })).body.error?.code).not.toBe('rate_limit');
		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_research_topic', payload: { brandId: 'brand-1', query: 'topic two' } })).body.error?.code).not.toBe('rate_limit');
	});

	it('still rate-limits non-admin credential owners', async () => {
		const normalUserId = 'user-normal-quota';
		const { secret } = await issueAgentCredential({
			name: 'Limited',
			ownerUserId: normalUserId,
			allowedBrandIds: ['brand-1'],
			capabilities: ['system:read'],
			environment: 'test',
			rateLimit: { requestsPerHour: 1, generationsPerDay: 1, researchRequestsPerDay: 1, publishActionsPerDay: 1, adProposalsPerDay: 1 },
		});

		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_get_capabilities', payload: {} })).body.ok).toBe(true);
		expect((await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_get_capabilities', payload: {} })).body.error?.code).toBe('rate_limit');
	});

	it('still rate-limits daily research buckets for non-admin owners', async () => {
		const normalUserId = 'user-research-quota';
		const { secret } = await issueAgentCredential({
			name: 'Research limited',
			ownerUserId: normalUserId,
			allowedBrandIds: ['brand-1'],
			capabilities: ['research:create', 'brand:read'],
			environment: 'test',
			rateLimit: {
				requestsPerHour: 100,
				generationsPerDay: 100,
				researchRequestsPerDay: 1,
				publishActionsPerDay: 100,
				adProposalsPerDay: 100,
			},
		});

		const payload = { brandId: 'brand-1', query: 'first' };
		await executeFromAuthorization({ authorization: `Bearer ${secret}`, action: 'cce_research_topic', payload });
		const second = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_research_topic',
			payload: { brandId: 'brand-1', query: 'second' },
		});
		expect(second.body.error?.code).toBe('rate_limit');
		expect(second.body.error?.details).toMatchObject({ bucket: 'research' });
	});

	it('bypasses intelligence in-process rate buckets for platform admins', () => {
		const actor: IntelligenceActor = {
			type: 'web',
			actorId: 'admin-1',
			userId: 'admin-1',
			scopes: ['session'],
			platformAdmin: true,
		};
		for (let i = 0; i < 150; i += 1) {
			enforceIntelligenceRateLimit(actor, 'get_brand');
		}
	});

	it('still enforces intelligence rate buckets for normal users', () => {
		const actor: IntelligenceActor = {
			type: 'web',
			actorId: 'user-1',
			userId: 'user-1',
			scopes: ['session'],
			platformAdmin: false,
		};
		enforceIntelligenceRateLimit(actor, 'get_brand');
		expect(() => {
			for (let i = 0; i < 200; i += 1) {
				enforceIntelligenceRateLimit(actor, 'get_brand');
			}
		}).toThrow(/Rate limit exceeded/);
	});

	it('returns ok from enforceCaps for platform admins without entitlements', async () => {
		setPlatformSuperAdminOverrideForTests('admin-caps-user', true);
		const check = await enforceCaps('admin-caps-user');
		expect(check.ok).toBe(true);
	});
});
