import { describe, expect, it } from 'vitest';
import { candidatesFromPillarHits } from '@/lib/campaigns/discovery';
import { sameSearchIntent, selectDistinctOpportunities } from '@/lib/campaigns/lanes';
import { classifyProductionFailure, nextRetryAt } from '@/lib/operations/recovery';
import { reconcilePublicationState } from '@/lib/publishing/reconcile';
import type { ContentOpportunity } from '@/lib/campaigns/types';

function opportunity(patch: Partial<ContentOpportunity>): ContentOpportunity {
	return {
		id: 'one',
		brandId: 'brand',
		campaignId: null,
		title: 'How to continue a fiction scene with AI without contradicting earlier chapters',
		audienceProblem: 'A later scene contradicts an earlier chapter.',
		searchIntent: 'informational',
		demandClass: 'inferred',
		evidenceConfidence: 'medium',
		score: 0.62,
		scoreDetail: { score: 0.62, confidence: 'medium', components: [], promotionBlocked: false, blockReason: null, lane: 'new_topic' },
		overlap: { decision: 'create', overlap: 0.2, matchedArticleId: null, matchedTitle: null, rationale: 'Distinct.' },
		recommendedAction: 'create',
		status: 'discovered',
		discoverySource: 'pillar',
		evidence: [{ id: 'e', sourceKind: 'search', url: 'https://example.com/a', excerpt: 'A source.', observedAt: null, metrics: null }],
		createdAt: '2026-11-20T00:00:00.000Z',
		updatedAt: '2026-11-20T00:00:00.000Z',
		...patch,
	};
}

describe('autonomous discovery and recovery', () => {
	it('keeps a distinct pillar question even though no search volume was measured', () => {
		const [candidate] = candidatesFromPillarHits({
			pillar: 'AI-assisted writing',
			query: 'how to continue a fiction scene with AI without contradicting earlier chapters',
			hits: [
				{ url: 'https://writing.example/scene', title: 'Continuing a scene', snippet: 'Writers need the earlier chapter in view.' },
				{ url: 'https://craft.example/ai', title: 'AI scene help', snippet: 'Do not let the tool contradict the chapter.' },
			],
			inventory: [{ id: 'existing', title: 'Can AI write a novel?', topic: 'AI novels', keyword: null, intent: 'informational', status: 'published', url: 'https://folian.app/articles/can-ai-write-a-novel' }],
			retrievedAt: '2026-11-20T00:00:00.000Z',
		});
		expect(candidate?.demandClass).toBe('inferred');
		expect(candidate?.forcedOverlap?.decision).toBe('create');
		expect(candidate?.businessRationale).toMatch(/No search volume/);
	});

	it('does not select two opportunities with the same search intent', () => {
		expect(sameSearchIntent('how to continue a fiction scene', 'continue a fiction scene with AI')).toBe(true);
		const chosen = selectDistinctOpportunities([
			opportunity({}),
			opportunity({ id: 'two', title: 'How to continue a fiction scene with AI', audienceProblem: 'Continuing a fiction scene contradicts earlier chapters.' }),
			opportunity({ id: 'three', title: 'How to track clues and reveals across a mystery novel', audienceProblem: 'Clues disappear between chapters.', score: 0.58 }),
		]);
		expect(chosen.map((item) => item.id)).toEqual(['one', 'three']);
	});

	it('retries a timeout and does not retry a product-claim or budget failure', () => {
		expect(classifyProductionFailure('The provider timed out.').recoverable).toBe(true);
		expect(classifyProductionFailure('Unsupported product claim.').recoverable).toBe(false);
		expect(classifyProductionFailure('The article budget is used.').recoverable).toBe(false);
		expect(classifyProductionFailure('Payload rejected the publishing credentials.').recoverable).toBe(false);
		expect(nextRetryAt(0, Date.parse('2026-11-20T00:00:00.000Z'))).toBe('2026-11-20T00:00:30.000Z');
		expect(nextRetryAt(3, Date.now())).toBeNull();
	});

	it('reconciles a live Payload article without inventing approval or a publish time', () => {
		const first = reconcilePublicationState({
			approval: 'pending',
			remoteStatus: 'draft',
			revision: 2,
			publicationState: null,
			canonicalUrl: null,
		}, { status: 'published', live: true, revision: 3, canonicalUrl: 'https://folian.app/articles/example', publishedAt: null });
		expect(first.changed).toBe(true);
		expect(first.publicationState).toBe('verified_live');
		expect(first.publishedAt).toBeNull();
		expect(first.flag).toMatch(/Approval/);
		const second = reconcilePublicationState({
			approval: 'pending',
			remoteStatus: 'published',
			revision: 3,
			publicationState: 'verified_live',
			canonicalUrl: 'https://folian.app/articles/example',
		}, { status: 'published', live: true, revision: 3, canonicalUrl: 'https://folian.app/articles/example', publishedAt: null });
		expect(second.changed).toBe(false);
		expect(second.flag).toBeNull();
	});
});
