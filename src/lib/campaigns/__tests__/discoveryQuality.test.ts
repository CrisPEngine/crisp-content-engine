import { afterEach, describe, expect, it } from 'vitest';
import { dedupeCandidates } from '@/lib/campaigns/dedupe';
import { candidatesFromMarket, classifyIntent, isAbstractPositioning, researchQueries } from '@/lib/campaigns/market';
import { addStageCost, metadataApprovalDecision, validateFullRevision, validateMetadataProposal, validateTargetedImprovement } from '@/lib/campaigns/optimisation';
import { createMemoryOpportunityRepository, setOpportunityRepositoryForTests } from '@/lib/campaigns/repository';
import { rescoreStoredEvidence } from '@/lib/campaigns/service';
import type { ScoreResult } from '@/lib/campaigns/types';

const score = (confidence: ScoreResult['confidence']): ScoreResult => ({
	score: 0.6,
	confidence,
	components: [],
	promotionBlocked: false,
	blockReason: null,
});

describe('discovery quality', () => {
	afterEach(() => setOpportunityRepositoryForTests(undefined));

	it('does not turn a positioning question into an article title', () => {
		expect(isAbstractPositioning('What should Folian refuse to do for the author?')).toBe(true);
		expect(researchQueries({
			brandName: 'Folian',
			problems: ['What should Folian refuse to do for the author?'],
			questions: ['Who decides what is true in the book?'],
			pillars: ['Writers lose track of canon'],
		})[0]).toContain('Writers lose track of canon');
		const { candidates } = candidatesFromMarket({
			queries: [{ query: 'What should Folian refuse to do for the author?', hits: [{ url: 'https://example.com/fans', title: 'Fans and spoilers', snippet: 'A publisher announcement.' }] }],
			inventory: [],
			brandHost: 'folian.app',
			retrievedAt: '2026-11-17T13:00:00.000Z',
		});
		expect(candidates).toEqual([]);
	});

	it('extracts a practical audience problem and classifies intent', () => {
		const { candidates: [candidate] } = candidatesFromMarket({
			queries: [{
				query: 'writers lose track of canon writers',
				hits: [
					{ url: 'https://example.com/canon', title: 'Writers lose track of canon', snippet: 'Authors lose track of facts across a long draft.' },
					{ url: 'https://reddit.com/r/writing/canon', title: 'How do you keep plot facts straight', snippet: 'I cannot keep track of canon between chapters.' },
				],
			}],
			inventory: [],
			brandHost: 'folian.app',
			retrievedAt: '2026-11-17T13:00:00.000Z',
			approvedProblems: ['Authors lose track of facts across a long draft'],
		});
		expect(candidate?.audienceProblem).toContain('lose track');
		expect(candidate?.title).toBe('Writers lose track of canon');
		expect(candidate?.searchIntent).toBe('informational');
		expect(classifyIntent('best tool pricing for novel software')).toBe('commercial');
		expect(candidate?.forcedOverlap?.decision).toBe('create');
		expect(candidate?.evidence[0]?.excerpt).toContain('Retrieved 2026-11-17T13:00:00.000Z');
		expect(candidate?.evidence[0]?.metrics).toBeNull();
	});

	it('merges two sources for the same problem into one opportunity', () => {
		const problem = 'Authors lose track of facts across a long draft.';
		const { candidates, merged } = dedupeCandidates([
			{ title: 'Writers lose track of canon', audienceProblem: problem, searchIntent: 'informational', demandClass: 'inferred', discoverySource: 'search', naturalKey: 'a', evidence: [{ sourceKind: 'search', url: 'https://example.com/a', excerpt: 'one', observedAt: '2026-11-17', metrics: null }], brandRelevance: 0.5, brandRationale: 'fit', businessRelevance: 0.4, businessRationale: 'one site' },
			{ title: 'Writers lose track of canon', audienceProblem: problem, searchIntent: 'informational', demandClass: 'inferred', discoverySource: 'community', naturalKey: 'b', evidence: [{ sourceKind: 'community', url: 'https://reddit.com/a', excerpt: 'two', observedAt: '2026-11-17', metrics: null }], brandRelevance: 0.5, brandRationale: 'fit', businessRelevance: 0.4, businessRationale: 'one site' },
		]);
		expect(merged).toBe(1);
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.evidence.map((item) => item.url)).toEqual(['https://example.com/a', 'https://reddit.com/a']);
	});

	it('validates metadata without structure or conversion checks', () => {
		const result = validateMetadataProposal({
			kind: 'metadata',
			sourceUrl: 'https://folian.app/articles/chatgpt-for-novel-writing',
			query: 'chatgpt for novel writing',
			originalTitle: 'ChatGPT for Novel Writing | Folian',
			originalDescription: 'Learn how writers can use ChatGPT for novel writing, where it helps, where it struggles and why long-form fiction needs story bibles, canon and structure.',
			proposedTitle: 'ChatGPT for Novel Writing: Uses & Limits | Folian',
			proposedDescription: 'Explore how ChatGPT can help with novel ideas, characters, plots and scene rewrites, and why long-form fiction needs story bibles, canon and structure.',
			evidence: '821 impressions, CTR 0.61%, average position 8.7.',
			rationale: 'The low click-through rate supports a more specific title.',
		});
		expect(result.pass).toBe(true);
		expect(result.checks.map((check) => check.name)).not.toContain('structure');
		expect(result.checks.map((check) => check.name)).not.toContain('conversion');
		expect(metadataApprovalDecision(result)).toBe('queue');
		const changed = validateMetadataProposal({
			kind: 'metadata',
			sourceUrl: 'https://folian.app/articles/chatgpt-for-novel-writing',
			query: 'chatgpt for novel writing',
			originalTitle: 'ChatGPT for Novel Writing | Folian',
			originalDescription: 'Learn how writers can use ChatGPT.',
			proposedTitle: 'Buy the best tool for pricing teams',
			proposedDescription: 'This guaranteed product automatically publishes a finished book and replaces the author.',
			evidence: '821 impressions.',
			rationale: 'Wrong subject.',
		});
		expect(changed.pass).toBe(false);
		expect(metadataApprovalDecision(changed)).toBe('blocked');
	});

	it('checks a targeted change without rewriting the surrounding sections', () => {
		const original = 'Opening stays.\n\nThe middle is vague.\n\nThe close stays.';
		const revised = 'Opening stays.\n\nThe middle now explains how to check canon before the next chapter.\n\nThe close stays.';
		const result = validateTargetedImprovement({ original, revised, changedExcerpt: 'The middle now explains how to check canon before the next chapter.' });
		expect(result.pass).toBe(true);
		expect(result.checks.find((check) => check.name === 'surrounding consistency')?.pass).toBe(true);
	});

	it('requires a full revision to keep the published article and clear critical findings', () => {
		expect(validateFullRevision({ reviewRan: false, criticalOpen: 1, originalPreserved: true }).pass).toBe(false);
		expect(validateFullRevision({ reviewRan: true, criticalOpen: 0, originalPreserved: true }).pass).toBe(true);
	});

	it('does not record zero when a model cost is missing', () => {
		expect(addStageCost(0.02, null)).toEqual({ costUsd: 0.02, missing: true });
		expect(addStageCost(0, 0.013).costUsd).toBe(0.013);
	});

	it('rescores page confidence for one brand and leaves the other brand unchanged', async () => {
		const repository = createMemoryOpportunityRepository();
		setOpportunityRepositoryForTests(repository);
		const page = await repository.save('user-a', {
			brandId: 'brand-a',
			campaignId: null,
			title: 'chatgpt for novel writing',
			audienceProblem: 'Existing page.',
			searchIntent: 'informational',
			demandClass: 'observed',
			evidenceConfidence: 'high',
			score: 0.625,
			scoreDetail: score('high'),
			overlap: { decision: 'update', overlap: 1, matchedArticleId: null, matchedTitle: null, rationale: 'Page exists.' },
			recommendedAction: 'update',
			status: 'discovered',
			discoverySource: 'search_console',
			naturalKey: 'search_console:page:/articles/chatgpt-for-novel-writing',
			evidence: [{ id: '', sourceKind: 'search_console', url: 'https://folian.app/articles/chatgpt-for-novel-writing', excerpt: 'Page total, not a single query: 821 impressions.', observedAt: '2026-11-17', metrics: { impressions: 821, clicks: 5, ctr: 0.006, position: 8.7, startDate: '2026-10-20', endDate: '2026-11-17' } }],
		});
		const other = await repository.save('user-b', {
			brandId: 'brand-b',
			campaignId: null,
			title: 'other brand page',
			audienceProblem: 'Other brand.',
			searchIntent: null,
			demandClass: 'observed',
			evidenceConfidence: 'high',
			score: 0.5,
			scoreDetail: score('high'),
			overlap: { decision: 'update', overlap: 1, matchedArticleId: null, matchedTitle: null, rationale: 'Other.' },
			recommendedAction: 'update',
			status: 'discovered',
			discoverySource: 'search_console',
			naturalKey: 'search_console:page:/other',
			evidence: [{ id: '', sourceKind: 'search_console', url: 'https://example.com/other', excerpt: 'Page total, not a single query: 10 impressions.', observedAt: '2026-11-17', metrics: { impressions: 10, clicks: 0, ctr: 0, position: 9, startDate: '2026-10-20', endDate: '2026-11-17' } }],
		});
		const changes = await rescoreStoredEvidence('user-a', 'brand-a');
		const updated = await repository.get('user-a', page.id);
		const untouched = await repository.get('user-b', other.id);
		expect(changes).toEqual([{ id: page.id, title: 'chatgpt for novel writing', from: 'high', to: 'medium', scope: 'page' }]);
		expect(updated?.evidenceConfidence).toBe('medium');
		expect(updated?.evidence[0]?.metrics?.impressions).toBe(821);
		expect(updated?.evidence[0]?.metrics?.scope).toBeUndefined();
		expect(updated?.scoreDetail.rescore?.metricsUnchanged).toBe(true);
		expect(untouched?.evidenceConfidence).toBe('high');
	});
});
