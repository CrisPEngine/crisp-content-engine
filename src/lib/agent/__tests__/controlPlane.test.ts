import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as agentPost } from '@/app/api/agent/v1/route';
import { handleMcpHttp } from '@/lib/agent/mcp';
import { setAgentStoreForTests } from '@/lib/agent/controlStore';
import { executeFromAuthorization } from '@/lib/agent/execute';
import { issueAgentCredential } from '@/lib/agent/credentials';
import { createMemoryAgentStore } from '@/lib/agent/controlStore';
import { FOLIAN_GROK_CAPABILITIES, FOLIAN_GROK_RATE_LIMIT } from '@/lib/agent/policy';
import { setIntelligenceAiForTests, setIntelligenceStoreForTests } from '@/lib/intelligence/actions';
import { createMemoryIntelligenceStore } from '@/lib/intelligence/memoryStore';
import type { IntelligenceAi } from '@/lib/intelligence/pipeline';
import {
	FOLIAN_BRAND_ID,
	FOLIAN_USER_ID,
	folianGuardrails,
	folianIdentity,
	folianKnowledge,
	folianVoice,
} from '@/lib/intelligence/__tests__/folianFixture';

const DRAFT = 'Folian keeps canon from drifting between sessions. Authors approve what becomes memory. It is not a ghostwriter.';
const REVISED = 'Folian keeps canon, and the author still decides which facts become memory.';

function stubAi(): IntelligenceAi {
	return {
		async completeJson<T>(role: string, messages: Array<{ content: string }>) {
			const joined = messages.map((message) => message.content).join('\n');
			if (joined.includes('REVISION INSTRUCTION')) {
				return { data: { draft: REVISED } as T, model: 'stub-writer', estimatedCostUsd: 0 };
			}
			if (role === 'REVIEW') return { data: { revisedDraft: DRAFT } as T, model: 'stub-review', estimatedCostUsd: 0 };
			if (role === 'FAST') {
				return {
					data: {
						selectedTheme: 'AI and authorship',
						topic: 'Why autocomplete fails a novel',
						angle: 'Canon has to persist',
						centralArgument: 'Canon has to persist with the author',
					} as T,
					model: 'stub-fast',
					estimatedCostUsd: 0,
				};
			}
			return {
				data: {
					draft: DRAFT,
					hook: 'Most writing tools forget the book.',
					argument: 'Canon has to persist with author approval.',
					cta: 'Look at story memory.',
					topic: 'Why autocomplete fails a novel',
				} as T,
				model: 'stub-writer',
				estimatedCostUsd: 0,
			};
		},
	};
}

async function call(secret: string, action: string, payload: Record<string, unknown> = {}, idempotencyKey?: string) {
	return executeFromAuthorization({
		authorization: `Bearer ${secret}`,
		action,
		payload,
		idempotencyKey,
	});
}

describe('agent control plane', () => {
	let secret = '';
	let brandId = '';
	let otherBrandId = '';
	const store = createMemoryIntelligenceStore();
	const agents = createMemoryAgentStore();
	const previous: Record<string, string | undefined> = {};

	beforeEach(async () => {
		for (const key of ['NATIVE_INTELLIGENCE_ENABLED', 'NATIVE_INTELLIGENCE_BRAND_ALLOWLIST', 'AGENT_SUBMIT_TO_QUEUE']) {
			previous[key] = process.env[key];
		}
		setIntelligenceStoreForTests(store);
		setIntelligenceAiForTests(stubAi());
		setAgentStoreForTests(agents);
		const brain = await store.upsertBrandBrain(FOLIAN_USER_ID, FOLIAN_BRAND_ID, {
			identity: folianIdentity,
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		brandId = brain.id;
		process.env.NATIVE_INTELLIGENCE_ENABLED = 'true';
		process.env.NATIVE_INTELLIGENCE_BRAND_ALLOWLIST = brain.id;
		delete process.env.AGENT_SUBMIT_TO_QUEUE;
		await store.addExample(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			kind: 'good',
			channel: 'linkedin',
			body: 'Folian is not a ghostwriter. It is the memory layer that keeps canon from drifting between sessions.',
		});
		const strategy = await store.upsertStrategy(FOLIAN_USER_ID, {
			userId: FOLIAN_USER_ID,
			brandBrainId: brain.id,
			airtableBrandId: FOLIAN_BRAND_ID,
			status: 'active',
			objectives: ['Become the default story-memory layer for serious novelists'],
			audiences: [{ name: 'Serious fiction authors', problems: ['Lost canon'], desiredOutcomes: ['Finish the book'] }],
			audienceProblems: ['Chat tools invent facts'],
			desiredOutcomes: ['Trusted canon'],
			positioning: folianIdentity.positioning,
			keyMessages: ['Memory is the product', 'Authors approve canon', 'Not a ghostwriter'],
			proofPoints: ['Approval before facts persist'],
			contentPillars: ['AI and authorship', 'Continuity craft', 'Author authority'],
			funnelStages: ['awareness'],
			ctaStrategy: { default: 'Invite a look at story memory' },
			contentMix: { linkedin: 0.5 },
			editorialThemes: ['AI and authorship'],
		});
		await store.createTheme(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			strategyId: strategy.id,
			title: 'AI and authorship',
			description: 'Serious writing needs memory, not autocomplete.',
			objective: 'authority',
			targetAudience: 'Serious fiction authors',
			relatedPillars: ['AI and authorship'],
			keyArguments: ['Canon must persist'],
			subtopics: [],
			questionsToAnswer: [],
			proofPoints: [],
			keywords: ['canon', 'authorship'],
			channels: ['linkedin', 'x'],
			status: 'active',
		});
		await store.createTheme(FOLIAN_USER_ID, {
			brandBrainId: brain.id,
			strategyId: strategy.id,
			title: 'Continuity craft',
			description: 'Continuity is the work of keeping the book consistent.',
			objective: 'authority',
			relatedPillars: ['Continuity craft'],
			keyArguments: ['Continuity compounds'],
			subtopics: [],
			questionsToAnswer: [],
			proofPoints: [],
			keywords: ['continuity'],
			channels: ['linkedin'],
			status: 'active',
		});
		const other = await store.upsertBrandBrain(FOLIAN_USER_ID, 'recOtherBrand', {
			identity: { ...folianIdentity, name: 'Other Brand Secret' },
			voice: folianVoice,
			guardrails: folianGuardrails,
			knowledge: folianKnowledge,
		});
		otherBrandId = other.id;
		const issued = await issueAgentCredential({
			name: 'Folian Marketing Grok',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brain.id],
			capabilities: FOLIAN_GROK_CAPABILITIES,
			environment: 'test',
			rateLimit: FOLIAN_GROK_RATE_LIMIT,
		});
		secret = issued.secret;
	});

	afterEach(() => {
		setIntelligenceStoreForTests(undefined);
		setIntelligenceAiForTests(undefined);
		setAgentStoreForTests(undefined);
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it('runs the Folian operator workflow without publishing or approving', async () => {
		const brief = await call(secret, 'cce_get_marketing_brief');
		expect(brief.body.ok).toBe(true);
		expect(JSON.stringify(brief.body)).toContain('Folian');
		expect(JSON.stringify(brief.body)).not.toContain(secret);
		expect(JSON.stringify(brief.body)).not.toContain(FOLIAN_BRAND_ID);

		const brand = await call(secret, 'cce_get_brand');
		expect(brand.body.result).toMatchObject({ name: 'Folian' });
		const denied = await call(secret, 'cce_get_brand', { brandId: otherBrandId });
		expect(denied.body.error?.code).toBe('brand_not_accessible');
		expect(JSON.stringify(denied.body)).not.toContain('Other Brand Secret');

		const strategy = await call(secret, 'cce_get_strategy');
		expect(JSON.stringify(strategy.body)).toContain('story-memory');
		const gaps = await call(secret, 'cce_get_calendar_gaps');
		expect(JSON.stringify(gaps.body)).toContain('No linkedin post is scheduled');

		const opportunityInput = {
			source: 'x',
			sourcePlatform: 'x',
			sourceUrl: 'https://x.com/example/status/1',
			topic: 'AI authorship',
			summary: 'Authors need canon and continuity. Authorship and memory should stay with the author, not autocomplete.',
			whyRelevant: 'The conversation is about author authority and story memory.',
			opportunityType: 'CONVERSATION',
			evidence: [{ url: 'https://x.com/example/status/1', excerpt: 'Who owns the draft when a model suggests the next scene?', retrievedAt: '2026-10-04T00:00:00.000Z' }],
		};
		const opportunity = await call(secret, 'cce_create_opportunity', opportunityInput, 'opp-1');
		expect(opportunity.body.ok).toBe(true);
		const opportunityId = (opportunity.body.result as { id: string }).id;
		const replay = await call(secret, 'cce_create_opportunity', opportunityInput, 'opp-1');
		expect((replay.body.result as { id: string }).id).toBe(opportunityId);
		const conflict = await call(secret, 'cce_create_opportunity', {
			source: 'x',
			sourceUrl: 'https://x.com/example/status/1',
			topic: 'Different topic',
			summary: 'A different payload must not reuse the key.',
		}, 'opp-1');
		expect(conflict.body.error?.code).toBe('idempotency_conflict');

		const evaluation = await call(secret, 'cce_evaluate_opportunity', { opportunityId });
		expect((evaluation.body.result as { evaluation: { action: string } }).evaluation.action).toBe('draft');

		const createdBrief = await call(secret, 'cce_create_brief', { opportunityId, instruction: 'Answer the authorship conversation from Folian strategy.', channel: 'LINKEDIN_PERSONAL' }, 'brief-1');
		const briefId = (createdBrief.body.result as { briefId: string }).briefId;
		const generated = await call(secret, 'cce_generate_content', { briefId, channels: ['LINKEDIN_PERSONAL', 'X'] }, 'gen-1');
		expect(generated.body.ok).toBe(true);
		const outputs = (generated.body.result as { outputs: Array<{ contentId: string; channel: string; body: string; status: string }> }).outputs;
		expect(outputs).toHaveLength(2);
		expect(new Set(outputs.map((item) => item.channel)).size).toBe(2);
		expect(outputs.every((item) => item.status === 'draft')).toBe(true);
		const contentId = outputs[0].contentId;

		const revision = await call(secret, 'cce_request_revision', { contentId, instruction: 'Make the author-approval point clearer.' }, 'rev-1');
		expect((revision.body.result as { body: string }).body).toContain('author still decides');
		const versions = await call(secret, 'cce_get_versions', { contentId });
		expect((versions.body.result as { versions: unknown[] }).versions.length).toBeGreaterThanOrEqual(2);

		const submitted = await call(secret, 'cce_submit_for_approval', { contentId }, 'submit-1');
		expect(submitted.body.result).toMatchObject({ status: 'awaiting_approval', approver: 'human', published: false });
		const approved = await call(secret, 'cce_approve_content', { contentId }, 'approve-1');
		expect(approved.body.error?.code).toBe('capability_not_enabled');
		const afterDecision = await call(secret, 'cce_get_content', { contentId });
		expect((afterDecision.body.result as { content: { status: string } }).content.status).toBe('review');
		const scheduled = await call(secret, 'cce_schedule_content', { contentId, publishAt: '2026-10-06T09:00:00.000Z' }, 'sched-1');
		expect(scheduled.body.error?.code).toBe('content_not_approved');

		const performance = await call(secret, 'cce_get_content_performance', { contentId });
		expect(JSON.stringify(performance.body)).toContain('Insufficient history');
		const tooSoon = await call(secret, 'cce_propose_experiment', {}, 'exp-too-soon');
		expect((tooSoon.body.result as { proposed: boolean }).proposed).toBe(false);

		const themes = await store.listThemes(FOLIAN_USER_ID, brandId);
		const authorship = themes.find((theme) => theme.title === 'AI and authorship');
		for (let index = 0; index < 3; index += 1) {
			await store.saveMemory(FOLIAN_USER_ID, {
				brandBrainId: brandId,
				themeId: authorship?.id,
				channel: 'linkedin',
				topic: 'AI and authorship',
				publicationStatus: 'published',
				body: `Earlier authorship note ${index}`,
			});
		}
		const experiment = await call(secret, 'cce_propose_experiment', {}, 'exp-1');
		expect(experiment.body.result).toMatchObject({ proposed: true, winner: null, confidence: 'low' });

		const later = await call(secret, 'cce_get_marketing_brief');
		expect(JSON.stringify(later.body)).toContain(contentId);
		const actions = await call(secret, 'cce_get_next_best_actions');
		expect(JSON.stringify(actions.body)).toContain('human');
		expect(JSON.stringify(actions.body)).toContain('Approve content');

		const spend = await call(secret, 'cce_propose_budget_change', { platform: 'meta', campaign: 'launch', reason: 'Move budget toward the clearer creative.', dailyBudgetDelta: '0' }, 'budget-1');
		expect(spend.body.result).toMatchObject({ status: 'approval_required', executed: false, consequence: 4 });

		const external = await store.saveMemory(FOLIAN_USER_ID, {
			brandBrainId: brandId,
			channel: 'x',
			topic: 'External note',
			publicationStatus: 'approved',
			body: 'Recorded after it was posted outside CCE.',
		});
		const recorded = await call(secret, 'cce_record_external_publish', {
			contentId: external.id,
			channel: 'X',
			externalId: 'post-1',
			externalUrl: 'https://x.com/folian/status/9',
			method: 'manual',
		}, 'ext-1');
		expect(recorded.body.result).toMatchObject({ recorded: true, publishedByCce: false });
		const blocked = await call(secret, 'cce_record_external_publish', {
			contentId: external.id,
			channel: 'X',
			externalId: 'post-2',
			externalUrl: 'http://127.0.0.1/private',
		}, 'ext-2');
		expect(blocked.body.error?.code).toBe('invalid_url');
		const engagement = await call(secret, 'cce_record_external_engagement', {
			contentId: external.id,
			channel: 'X',
			source: 'manual',
			impressions: 10,
		}, 'eng-1');
		expect(engagement.body.result).toMatchObject({ source: 'manual', reliability: 'manual' });

		const audit = await agents.listAudit(FOLIAN_USER_ID);
		expect(audit.length).toBeGreaterThan(5);
		expect(JSON.stringify(audit)).not.toContain(secret);
		expect(audit.some((entry) => entry.action === 'cce_submit_for_approval' && entry.resultStatus === 'ok')).toBe(true);
	});

	it('rejects revoked and expired keys and enforces rate limits', async () => {
		const revoked = await issueAgentCredential({
			name: 'Revoked',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brandId],
			capabilities: ['brand:read'],
			environment: 'test',
		});
		await agents.updateCredential(revoked.credential.id, { revokedAt: new Date().toISOString() });
		expect((await call(revoked.secret, 'cce_get_brands')).body.error?.code).toBe('revoked_key');

		const expired = await issueAgentCredential({
			name: 'Expired',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brandId],
			capabilities: ['brand:read'],
			environment: 'test',
			expiresAt: '2020-01-01T00:00:00.000Z',
		});
		expect((await call(expired.secret, 'cce_get_brands')).body.error?.code).toBe('expired_key');

		const limited = await issueAgentCredential({
			name: 'Limited',
			ownerUserId: FOLIAN_USER_ID,
			allowedBrandIds: [brandId],
			capabilities: ['brand:read'],
			environment: 'test',
			rateLimit: { requestsPerHour: 2, generationsPerDay: 1, researchRequestsPerDay: 1, publishActionsPerDay: 1, adProposalsPerDay: 1 },
		});
		expect((await call(limited.secret, 'cce_get_brands')).body.ok).toBe(true);
		expect((await call(limited.secret, 'cce_get_brands')).body.ok).toBe(true);
		expect((await call(limited.secret, 'cce_get_brands')).body.error?.code).toBe('rate_limit');
	});

	it('serves the same brand through MCP and REST', async () => {
		const listed = await handleMcpHttp(new Request('https://app.crispdigital.io/api/mcp', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
		}));
		const tools = (await listed.json()) as { result: { tools: Array<{ name: string; inputSchema: { type: string } }> } };
		expect(tools.result.tools.some((tool) => tool.name === 'cce_get_marketing_brief' && tool.inputSchema.type === 'object')).toBe(true);
		expect(tools.result.tools.some((tool) => tool.name === 'cce_approve_content')).toBe(false);

		const viaMcp = await handleMcpHttp(new Request('https://app.crispdigital.io/api/mcp', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'cce_get_brand', arguments: {} } }),
		}));
		const mcpBody = (await viaMcp.json()) as { result: { structuredContent: { result: { name: string } } } };
		const viaRest = await agentPost(new Request('https://app.crispdigital.io/api/agent/v1', {
			method: 'POST',
			headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'cce_get_brand', input: {} }),
		}));
		const restBody = (await viaRest.json()) as { result: { name: string } };
		expect(mcpBody.result.structuredContent.result.name).toBe(restBody.result.name);

		const anonymous = await handleMcpHttp(new Request('https://app.crispdigital.io/api/mcp', {
			method: 'POST',
			headers: { accept: 'application/json', 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' }),
		}));
		expect(anonymous.status).toBe(401);
	});
});
