import { describe, expect, it } from 'vitest';
import { opportunityKind, presentOpportunity } from '@/lib/campaigns/presentation';
import { selectProductionOpportunities } from '@/lib/campaigns/productionPolicy';
import { planOperationTick } from '@/lib/operations/policy';
import { recordHistoricalGeneration } from '@/lib/articles/generationJob';
import { cmsMarkdown } from '@/lib/publishing/folianMap';
import { runDeterministicArticleReview } from '@/lib/articles/editorialReview';
import type { ContentOpportunity, ProductionJob } from '@/lib/campaigns/types';

function opportunity(patch: Partial<ContentOpportunity> = {}): ContentOpportunity {
	return {
		id: 'opp',
		brandId: 'brand',
		title: 'how to track clues and reveals across a mystery novel',
		audienceProblem: 'A mystery hides a clue.',
		searchIntent: 'informational',
		demandClass: 'inferred',
		discoverySource: 'pillar',
		evidence: [],
		evidenceConfidence: 'medium',
		score: 0.258,
		scoreDetail: { lane: 'new_topic', score: 0.258, components: [], confidence: 'medium', blockReason: null, laneRationale: '', promotionBlocked: false, selectionRationale: '' },
		recommendedAction: 'create',
		overlap: { decision: 'create', overlap: 0, matchedArticleId: null, matchedTitle: null, rationale: '' },
		status: 'approved',
		createdAt: '2026-11-20T22:10:17.000Z',
		updatedAt: '2026-11-20T22:10:17.000Z',
		...patch,
	};
}

function job(patch: Partial<ProductionJob> = {}): ProductionJob {
	return {
		id: 'job',
		brandId: 'brand',
		campaignId: 'campaign',
		opportunityId: 'opp',
		articleId: 'article',
		stage: 'research',
		status: 'queued',
		attempt: 0,
		note: '',
		error: null,
		costUsd: 0,
		stageLog: [],
		createdAt: '2026-11-20T22:00:00.000Z',
		updatedAt: '2026-11-20T22:00:00.000Z',
		...patch,
	};
}

describe('opportunity production visibility', () => {
	it('keeps an approved opportunity waiting while the campaign is paused', () => {
		const view = presentOpportunity({ opportunity: opportunity(), campaignPaused: true });
		expect(view.phase).toBe('approved_for_production');
		expect(view.next).toContain('does not start');
	});

	it('shows a deferred opportunity separately from production', () => {
		expect(presentOpportunity({ opportunity: opportunity({ status: 'deferred', title: 'how to choose novel writing software for story notes versus drafting' }) }).phase).toBe('deferred');
	});

	it('links a job stage to writing or article approval', () => {
		expect(presentOpportunity({ opportunity: opportunity({ status: 'in_production' }), job: job({ stage: 'draft', status: 'running', attempt: 1 }) }).phase).toBe('writing');
		expect(presentOpportunity({ opportunity: opportunity({ status: 'in_production' }), job: job({ stage: 'approval', status: 'ready_for_approval' }) }).phase).toBe('awaiting_article_approval');
	});

	it('treats a published article as a refresh, not a new article', () => {
		expect(opportunityKind(opportunity({ title: 'How To Organize Timelines In Fiction - Focus on Fiction', recommendedAction: 'create' }), ['How to Organize Timelines in Fiction'])).toBe('refresh');
		expect(opportunityKind(opportunity(), ['Can AI Write a Novel for Me?'])).toBe('new');
	});

	it('orders equal scores by the time they were approved', () => {
		const chosen = selectProductionOpportunities({
			opportunities: [
				opportunity({ id: 'later', updatedAt: '2026-11-20T22:11:09.000Z' }),
				opportunity({ id: 'first', title: 'how to revise one chapter without rewriting the whole novel', updatedAt: '2026-11-20T22:10:17.000Z' }),
			],
			opportunityIdsInProduction: [],
			remaining: 2,
		});
		expect(chosen.map((item) => item.id)).toEqual(['first', 'later']);
	});

	it('does not start production while the campaign is paused', () => {
		const actions = planOperationTick({
			policy: { mode: 'autonomous_approval', paused: true, autonomousPublishingEnabled: false, allowPublishedUpdates: false, weeklyMaximum: 3, maxConcurrentJobs: 1, maxCostUsdPerArticle: 1, maxCorrectionAttempts: 3, themes: [] },
			leaseHeld: false,
			opportunities: [opportunity()],
			jobs: [],
		});
		expect(actions).toEqual([{ type: 'skip', reason: 'paused' }]);
	});
});

describe('historical generation and payload readiness', () => {
	it('moves a timeout off a saved draft and keeps an empty draft failed', () => {
		const saved = { body: 'A saved draft.', workspace: { revision: { id: 'rev' }, generation: { jobId: 'job', status: 'failed' as const, error: 'The job exceeded the execution limit. Nothing partial was saved. Retry keeps this article.', stage: 'Failed', history: [] as Array<{ jobId: string | null; at: string; message: string }> } } };
		expect(recordHistoricalGeneration(saved, 'job', saved.workspace.generation.error)).toBe(true);
		expect(saved.workspace.generation.status).toBe('completed');
		expect(saved.workspace.generation.error).toBeNull();
		expect(saved.workspace.generation.history?.[0]?.message).toContain('execution limit');
		const empty = { body: ' ', workspace: { revision: null, generation: { jobId: null, status: 'failed', error: 'timeout', stage: 'Failed' } } };
		expect(recordHistoricalGeneration(empty, 'job', 'timeout')).toBe(false);
	});

	it('sends a checklist as an ordinary list', () => {
		expect(cmsMarkdown('- [ ] Approve and save the scene.\n- [x] Done.')).toBe('- Approve and save the scene.\n- Done.');
	});

	it('does not require the word-count planner for a scene article', () => {
		const review = runDeterministicArticleReview({
			body: '## Scene\n\nContinue the novel scene from the locked door.',
			wordCount: 20,
			targetWords: 1400,
			categoryId: 'planning-continuity',
			taxonomy: { destination: 'folian', schemaVersion: 1, categoryCreationPolicy: 'closed', categories: [], contentTypes: [], tags: { policy: 'open' }, tools: [{ slug: 'word-count-planner', label: 'Word Count Planner', routePath: '/tools/word-count-planner', linkWhenTopicMatches: 'novel|word count' }] },
			sourceCount: 1,
			claimsExternalResearch: false,
			toolSlugs: [],
			title: 'how to continue a fiction scene with AI',
			topic: 'scene continuation',
			primaryKeyword: 'continue a fiction scene',
		});
		expect(review.findings.some((finding) => finding.code === 'missing_destination_resource')).toBe(false);
	});
});
