import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMcpHttp } from '@/lib/agent/mcp';
import { createMemoryAgentStore, setAgentStoreForTests } from '@/lib/agent/controlStore';
import { executeFromAuthorization } from '@/lib/agent/execute';
import {
	agentRequestHash,
	pickExplicitIdempotencyKey,
	synthesizeIdempotencyKey,
} from '@/lib/agent/idempotency';
import { jsonSchemaFor, getAgentAction } from '@/lib/agent/registry';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceAiForTests, setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import {
	FOLIAN_BRAND_ID,
	FOLIAN_USER_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '@/lib/intelligence/__tests__/folianFixture';

describe('agent idempotency resolution', () => {
	it('prefers explicit keys from args and headers', () => {
		expect(
			pickExplicitIdempotencyKey({
				direct: 'direct-key',
				payload: { idempotencyKey: 'payload-key' },
				headers: { get: () => 'header-key' },
			}),
		).toBe('direct-key');
		expect(
			pickExplicitIdempotencyKey({
				payload: { idempotency_key: 'snake-key' },
				headers: { get: (name) => (name === 'Idempotency-Key' ? 'header-key' : null) },
			}),
		).toBe('snake-key');
	});

	it('synthesizes a stable key for the same credential, action, and payload', () => {
		const payload = { topic: 'Canon', summary: 'Memory matters.' };
		const first = synthesizeIdempotencyKey('cred-1', 'cce_create_opportunity', payload);
		const second = synthesizeIdempotencyKey('cred-1', 'cce_create_opportunity', payload);
		const otherCredential = synthesizeIdempotencyKey('cred-2', 'cce_create_opportunity', payload);
		expect(first).toBe(second);
		expect(first.startsWith('auto:')).toBe(true);
		expect(otherCredential).not.toBe(first);
		expect(agentRequestHash('cce_create_opportunity', { ...payload, idempotencyKey: 'ignored' })).toBe(
			agentRequestHash('cce_create_opportunity', payload),
		);
	});

	it('advertises optional idempotencyKey on mutating MCP tool schemas', () => {
		const brief = getAgentAction('cce_create_brief');
		const read = getAgentAction('cce_get_brand');
		expect(brief).not.toBeNull();
		expect(read).not.toBeNull();
		const briefSchema = jsonSchemaFor(brief!.schema) as { properties?: Record<string, unknown> };
		const readSchema = jsonSchemaFor(read!.schema) as { properties?: Record<string, unknown> };
		expect(briefSchema.properties?.idempotencyKey).toEqual({ type: 'string' });
		expect(readSchema.properties?.idempotencyKey).toBeUndefined();
	});
});

describe('agent idempotency execution', () => {
	const store = createMemoryIntelligenceStore();
	const agents = createMemoryAgentStore();
	let secret = '';
	let opportunityId = '';

	beforeEach(async () => {
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests({
			async completeJson<T>() {
				return { data: {} as T, model: 'stub', estimatedCostUsd: 0 };
			},
		});
		setAgentStoreForTests(agents);
		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID, {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = brain.id;
		const issued = await issueAgentCredential({
			name: 'Idempotency test agent',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brain.id],
			capabilities: FOLIAN_GROK_CAPABILITIES,
			environment: 'test',
			rateLimit: FOLIAN_GROK_RATE_LIMIT,
		});
		secret = issued.secret;
		const opportunity = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_create_opportunity',
			payload: {
				source: 'x',
				topic: 'Seed opportunity',
				summary: 'Seed summary for brief tests.',
			},
			idempotencyKey: 'seed-opportunity',
		});
		opportunityId = (opportunity.body.result as { id: string }).id;
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		setAgentStoreForTests(undefined);
	});

	it('allows mutating REST calls without an explicit idempotency key', async () => {
		const created = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_create_brief',
			payload: { opportunityId, instruction: 'Write from strategy.', channel: 'LINKEDIN_PERSONAL' },
		});
		expect(created.body.ok).toBe(true);
		const replay = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_create_brief',
			payload: { opportunityId, instruction: 'Write from strategy.', channel: 'LINKEDIN_PERSONAL' },
		});
		expect((replay.body.result as { briefId: string }).briefId).toBe((created.body.result as { briefId: string }).briefId);
	});

	it('prefers an explicit idempotency key over synthesis', async () => {
		const payload = { opportunityId, instruction: 'Explicit key path.', channel: 'X' };
		const first = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_create_brief',
			payload,
			idempotencyKey: 'explicit-brief-key',
		});
		expect(first.body.ok).toBe(true);
		const replay = await executeFromAuthorization({
			authorization: `Bearer ${secret}`,
			action: 'cce_create_brief',
			payload,
			idempotencyKey: 'explicit-brief-key',
		});
		expect((replay.body.result as { briefId: string }).briefId).toBe((first.body.result as { briefId: string }).briefId);
	});

	it('serves mutating MCP tool calls without idempotencyKey in arguments', async () => {
		const response = await handleMcpHttp(new Request('https://app.crispdigital.io/api/mcp', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 9,
				method: 'tools/call',
				params: {
					name: 'cce_create_brief',
					arguments: { opportunityId, instruction: 'MCP without explicit key.', channel: 'X' },
				},
			}),
		}));
		const body = (await response.json()) as { result: { structuredContent: { ok: boolean; result?: { briefId: string } } } };
		expect(body.result.structuredContent.ok).toBe(true);
		expect(body.result.structuredContent.result?.briefId).toBeTruthy();
	});
});
