import { describe, expect, it } from 'vitest';
import { FOLIAN_PILOT_POLICY, lifecycleFor, normaliseOperationPolicy, performanceSignals, planOperationTick, publicationPolicyDecision } from '@/lib/operations/policy';
import { publicationQualityGate, publishDecision, livePageMatches } from '@/lib/publishing/payloadPublish';
import type { ContentOpportunity, ProductionJob } from '@/lib/campaigns/types';

function job(patch: Partial<ProductionJob>): ProductionJob {
	return {
		id: 'job-1',
		brandId: 'brand',
		campaignId: 'campaign',
		opportunityId: 'opp-1',
		articleId: 'article-1',
		stage: 'draft',
		status: 'queued',
		attempt: 1,
		note: '',
		error: null,
		costUsd: 0.2,
		stageLog: [{ stage: 'research', at: '2026-11-18T00:00:00.000Z', note: 'done' }],
		createdAt: '2026-11-18T00:00:00.000Z',
		updatedAt: '2026-11-18T00:10:00.000Z',
		...patch,
	};
}

function opportunity(patch: Partial<ContentOpportunity>): ContentOpportunity {
	return {
		id: 'opp-2',
		brandId: 'brand',
		campaignId: 'campaign',
		title: 'How to track a novel timeline',
		audienceProblem: 'Writers lose dates.',
		searchIntent: 'informational',
		demandClass: 'observed',
		evidenceConfidence: 'medium',
		score: 0.8,
		scoreDetail: { score: 0.8, confidence: 'medium', components: [], promotionBlocked: false, blockReason: null },
		overlap: { decision: 'create', overlap: 0.1, matchedArticleId: null, matchedTitle: null, rationale: 'Distinct.' },
		recommendedAction: 'create',
		status: 'approved',
		discoverySource: 'search_console',
		evidence: [],
		createdAt: '2026-11-18T00:00:00.000Z',
		updatedAt: '2026-11-18T00:00:00.000Z',
		...patch,
	};
}

const readyPolicy = {
	topicRelevant: true,
	researchApproved: true,
	articleComplete: true,
	factualClaimsVerified: true,
	productClaimsVerified: true,
	criticalOpen: 0,
	majorOpen: 0,
	blockingMinorOpen: 0,
	substantialDuplicate: false,
	seoReady: true,
	categoryReady: true,
	heroReady: true,
	internalLinksValid: true,
	editorialReviewPassed: true,
	qualityScore: 0.99,
};

describe('autonomous content policy', () => {
	it('keeps the Folian pilot unpublished and paused', () => {
		expect(FOLIAN_PILOT_POLICY.autonomousPublishingEnabled).toBe(false);
		expect(FOLIAN_PILOT_POLICY.paused).toBe(true);
		expect(FOLIAN_PILOT_POLICY.weeklyMaximum).toBe(3);
		expect(FOLIAN_PILOT_POLICY.maxCostUsdPerArticle).toBe(1);
		expect(FOLIAN_PILOT_POLICY.allowPublishedUpdates).toBe(false);
	});

	it('does not let an assisted or paused brand start production', () => {
		const policy = normaliseOperationPolicy({ approvalMode: 'assisted', weeklyCapacity: 3, status: 'active', themes: [], stored: null });
		expect(planOperationTick({ policy, leaseHeld: false, opportunities: [], jobs: [] })[0]).toMatchObject({ reason: 'assisted' });
		expect(planOperationTick({ policy: FOLIAN_PILOT_POLICY, leaseHeld: false, opportunities: [opportunity({})], jobs: [] })[0]).toMatchObject({ reason: 'paused' });
	});

	it('treats a second scheduler run as a no-op while the lease is held', () => {
		const policy = { ...FOLIAN_PILOT_POLICY, paused: false };
		expect(planOperationTick({ policy, leaseHeld: true, opportunities: [opportunity({})], jobs: [] })).toEqual([{ type: 'skip', reason: 'lease_held' }]);
	});

	it('refuses a second concurrent job and an update to a published article', () => {
		const policy = { ...FOLIAN_PILOT_POLICY, paused: false, allowPublishedUpdates: false };
		const actions = planOperationTick({
			policy,
			leaseHeld: false,
			opportunities: [opportunity({ id: 'update', recommendedAction: 'update' }), opportunity({ id: 'fresh' })],
			jobs: [job({ status: 'running', updatedAt: new Date().toISOString() })],
		});
		expect(actions.some((action) => action.type === 'start')).toBe(false);
		expect(actions).toContainEqual({ type: 'skip', reason: 'concurrency' });
	});

	it('resumes an interrupted job instead of starting another article', () => {
		const policy = { ...FOLIAN_PILOT_POLICY, paused: false };
		const stale = job({ status: 'running', updatedAt: '2026-11-18T00:00:00.000Z', stage: 'editorial' });
		const actions = planOperationTick({
			policy,
			leaseHeld: false,
			opportunities: [opportunity({})],
			jobs: [stale],
			now: Date.parse('2026-11-18T02:00:00.000Z'),
		});
		expect(actions).toContainEqual({ type: 'resume', jobId: 'job-1' });
		expect(actions).toContainEqual({ type: 'advance', jobId: 'job-1' });
		expect(actions.some((action) => action.type === 'start')).toBe(false);
	});

	it('stops at the article budget and does not publish without the brand switch', () => {
		const policy = { ...FOLIAN_PILOT_POLICY, paused: false, mode: 'autonomous_publishing' as const, autonomousPublishingEnabled: false };
		const actions = planOperationTick({
			policy,
			leaseHeld: false,
			opportunities: [],
			jobs: [job({ costUsd: 1, status: 'queued' })],
			publishable: [{ articleId: 'article-1', jobId: 'job-1', policyAllows: true, approved: true }],
		});
		expect(actions).toContainEqual({ type: 'skip', reason: 'budget' });
		expect(actions.some((action) => action.type === 'publish')).toBe(false);
		expect(actions.some((action) => action.type === 'hold_publish')).toBe(true);
	});

	it('rejects publication from a quality score when a required check fails', () => {
		const decision = publicationPolicyDecision({ ...readyPolicy, productClaimsVerified: false });
		expect(decision.allow).toBe(false);
		expect(decision.reasons.join(' ')).toMatch(/Product claims/);
		expect(publicationQualityGate({
			approved: false,
			researchApproved: true,
			criticalOpen: 0,
			materialOpen: [],
			seoReady: true,
			heroRequired: true,
			heroReady: true,
			editorialChecked: true,
			externalId: 'cce_article',
			expectedRevision: 2,
			currentRevision: 2,
		}).ok).toBe(false);
	});

	it('does not republish when the public page does not match', () => {
		const check = livePageMatches('<html><title>Other</title></html>', { title: 'How to organize timelines' });
		expect(check.retryPublication).toBe(false);
		expect(publishDecision({ approved: true, blockers: [], liveEnabled: true, explicit: true, autoPublish: true }).allow).toBe(false);
	});

	it('maps failed research and completed review to explicit states', () => {
		const policy = FOLIAN_PILOT_POLICY;
		expect(lifecycleFor({ job: job({ status: 'failed', stage: 'research', stageLog: [] }), policy })).toBe('failed');
		expect(lifecycleFor({ job: job({ status: 'ready_for_approval', stage: 'approval' }), policy })).toBe('awaiting_approval');
		expect(lifecycleFor({ job: job({ status: 'queued', stage: 'corrections' }), policy })).toBe('correcting');
		expect(lifecycleFor({ job: null, opportunityStatus: 'discovered', policy })).toBe('discovered');
	});

	it('turns weak observed clicks into a refresh signal without changing the article', () => {
		const signals = performanceSignals([opportunity({
			status: 'discovered',
			evidence: [{ id: 'e', sourceKind: 'search_console', url: null, excerpt: null, observedAt: null, metrics: { impressions: 40, clicks: 0, ctr: 0.01, position: 12, startDate: '', endDate: '', scope: 'query' } }],
		})]);
		expect(signals[0]?.kind).toBe('refresh');
	});
});
