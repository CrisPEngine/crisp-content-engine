import { describe, expect, it } from 'vitest';
import { classifyEditorialWork, remainingCapacity, selectProductionOpportunities } from '@/lib/campaigns/productionPolicy';
import type { ContentOpportunity } from '@/lib/campaigns/types';

function opportunity(patch: Partial<ContentOpportunity>): ContentOpportunity {
	return {
		id: 'opp-1',
		brandId: 'brand',
		campaignId: null,
		title: 'A new topic',
		audienceProblem: 'Readers cannot find this.',
		searchIntent: 'informational',
		demandClass: 'observed',
		evidenceConfidence: 'high',
		score: 0.6,
		scoreDetail: { score: 0.6, confidence: 'high', components: [], promotionBlocked: false, blockReason: null },
		overlap: { decision: 'create', overlap: 0, matchedArticleId: null, matchedTitle: null, rationale: 'No overlap.' },
		recommendedAction: 'create',
		status: 'approved',
		discoverySource: 'search_console',
		evidence: [],
		createdAt: '',
		updatedAt: '',
		...patch,
	};
}

describe('production policy', () => {
	it('applies only minor safe corrections and escalates unsupported claims', () => {
		const safe = classifyEditorialWork({
			correctionAttempts: 0,
			findings: [{ id: 'tone', severity: 'minor', category: 'writing', status: 'open' }],
			proposals: [{ id: 'p1', status: 'proposed', sourceFindingId: 'tone' }],
		});
		expect(safe.acceptIds).toEqual(['p1']);
		const blocked = classifyEditorialWork({
			correctionAttempts: 0,
			findings: [{ id: 'fact', severity: 'critical', category: 'accuracy', status: 'open' }],
			proposals: [{ id: 'p2', status: 'proposed', sourceFindingId: 'fact' }],
		});
		expect(blocked.acceptIds).toEqual([]);
		expect(blocked.escalate).toContain('accuracy');
		const examples = classifyEditorialWork({
			correctionAttempts: 0,
			findings: [{ id: 'example-conflict', severity: 'critical', category: 'examples', status: 'open' }],
			proposals: [{ id: 'p3', status: 'proposed', sourceFindingId: 'example-conflict' }],
		});
		expect(examples.acceptIds).toEqual(['p3']);
		expect(examples.escalate).toBeNull();
	});

	it('stops at the weekly maximum and does not fill an empty queue', () => {
		expect(remainingCapacity(3, 3)).toBe(0);
		expect(selectProductionOpportunities({
			opportunities: [opportunity({ recommendedAction: 'reject' }), opportunity({ id: 'opp-2', status: 'discovered' })],
			opportunityIdsInProduction: [],
			remaining: 3,
		})).toEqual([]);
		expect(selectProductionOpportunities({
			opportunities: [opportunity({ id: 'update', recommendedAction: 'update' })],
			opportunityIdsInProduction: [],
			remaining: 1,
		}).map((item) => item.id)).toEqual(['update']);
		const chosen = selectProductionOpportunities({
			opportunities: [opportunity({ id: 'low', score: 0.2 }), opportunity({ id: 'high', score: 0.9 }), opportunity({ id: 'used', score: 1 })],
			opportunityIdsInProduction: ['used'],
			remaining: 1,
		});
		expect(chosen.map((item) => item.id)).toEqual(['high']);
	});
});
