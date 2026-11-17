import { afterEach, describe, expect, it } from 'vitest';
import { candidatesFromSearch } from '@/lib/campaigns/discovery';
import { assessOverlap } from '@/lib/campaigns/overlap';
import { gscConfigured, providerAvailability } from '@/lib/campaigns/providers';
import { createMemoryOpportunityRepository, setOpportunityRepositoryForTests } from '@/lib/campaigns/repository';
import { candidatesFromMarket } from '@/lib/campaigns/market';
import { optimisationScope, scoreOpportunity } from '@/lib/campaigns/scoring';
import { createContentCampaign, decideOpportunity, recordContentOpportunity } from '@/lib/campaigns/service';
import { setNativeContentStoreForTests, createMemoryNativeContentStore } from '@/lib/media/store';
import type { InventoryArticle } from '@/lib/campaigns/types';

const inventory: InventoryArticle[] = [{
	id: 'article-1',
	title: 'How to Plan a Novel Without Losing the Freedom to Write',
	topic: 'How to plan a novel',
	keyword: 'plan a novel',
	intent: 'informational',
	status: 'published',
	url: 'https://folian.app/journal/plan-a-novel',
}];

describe('content opportunities', () => {
	afterEach(() => {
		setOpportunityRepositoryForTests(undefined);
		setNativeContentStoreForTests(undefined);
	});

	it('does not treat an idea as measured demand', () => {
		const scored = scoreOpportunity({
			demandClass: 'unvalidated',
			evidenceCount: 0,
			brandRelevance: 0.8,
			brandRationale: 'Operator idea.',
			uniqueValue: 1,
			uniqueRationale: 'No overlap.',
			businessRelevance: 0.5,
			businessRationale: 'No metric.',
			researchFeasibility: 0.2,
			researchRationale: 'No sources.',
		});
		expect(scored.components.find((row) => row.key === 'audienceDemand')?.value).toBe(0);
		expect(scored.components.find((row) => row.key === 'searchOpportunity')?.value).toBe(0);
		expect(scored.confidence).toBe('none');
		expect(scored.promotionBlocked).toBe(true);
		expect(JSON.stringify(scored)).not.toMatch(/volume|impressions/i);
	});

	it('keeps Search Console metrics separate from an inferred search result', () => {
		const observed = scoreOpportunity({
			demandClass: 'observed',
			measured: { impressions: 420, clicks: 18, ctr: 0.043, position: 14.2, startDate: '2026-10-01', endDate: '2026-10-28' },
			evidenceCount: 1,
			brandRelevance: 0.7,
			brandRationale: 'Property query.',
			uniqueValue: 0.4,
			uniqueRationale: 'Partial overlap.',
			businessRelevance: 0.6,
			businessRationale: 'Measured impressions.',
			researchFeasibility: 0.7,
			researchRationale: 'A page URL was returned.',
		});
		expect(observed.confidence).toBe('high');
		expect(observed.components.find((row) => row.key === 'audienceDemand')?.rationale).toContain('420 impressions');
		const inferred = candidatesFromSearch({
			topic: 'story bible for novel planning',
			source: 'search',
			inventory: [],
			brandTerms: ['Folian'],
			hits: [{ url: 'https://example.com/story-bible', title: 'Story bible', snippet: 'A public guide.', publishedAt: '2026-10-01' }],
		});
		expect(inferred[0]?.demandClass).toBe('inferred');
		expect(inferred[0]?.evidence[0]?.metrics).toBeNull();
	});

	it('recommends an update instead of a duplicate and does not change the article', () => {
		const overlap = assessOverlap({ title: 'Plan a novel chapter structure', intent: 'informational' }, inventory);
		expect(overlap.decision).toBe('update');
		expect(overlap.matchedArticleId).toBe('article-1');
		expect(overlap.rationale).toContain('Nothing was overwritten');
		expect(inventory[0]?.status).toBe('published');
	});

	it('rejects a near-identical query', () => {
		const overlap = assessOverlap({
			title: 'How to Plan a Novel Without Losing the Freedom to Write',
			keyword: 'plan a novel',
			intent: 'informational',
		}, inventory);
		expect(overlap.decision).toBe('reject');
	});

	it('blocks approval of an unvalidated opportunity and keeps auto-publish off', async () => {
		setNativeContentStoreForTests(createMemoryNativeContentStore());
		setOpportunityRepositoryForTests(createMemoryOpportunityRepository());
		const saved = await recordContentOpportunity('user-1', {
			brandId: 'brand-1',
			title: 'A speculative topic',
			audienceProblem: 'None recorded',
			demandClass: 'unvalidated',
		});
		await expect(decideOpportunity('user-1', saved.id, 'approved')).rejects.toMatchObject({ code: 'evidence_required' });
		await expect(createContentCampaign('user-1', {
			brandId: 'brand-1',
			name: 'Folian pilot',
			objective: 'Find a justified article',
			audience: 'Fiction writers',
			themes: [],
			weeklyCapacity: 3,
			selectionPolicy: 'evidence_required',
			approvalMode: 'auto_publish',
			destinationId: null,
			status: 'draft',
		})).rejects.toMatchObject({ code: 'auto_publish_locked' });
		const campaign = await createContentCampaign('user-1', {
			brandId: 'brand-1',
			name: 'Folian pilot',
			objective: 'Find a justified article',
			audience: 'Fiction writers',
			themes: [],
			weeklyCapacity: 3,
			selectionPolicy: 'evidence_required',
			approvalMode: 'auto_draft',
			destinationId: null,
			status: 'draft',
		});
		expect(campaign.autoPublishEnabled).toBe(false);
		expect(campaign.weeklyCapacity).toBe(3);
	});

	it('scores a page total below the same query total and keeps low CTR as metadata', () => {
		const shared = {
			evidenceCount: 1,
			brandRelevance: 0.4,
			brandRationale: 'Existing page.',
			uniqueValue: 0.2,
			uniqueRationale: 'Update.',
			businessRelevance: 0.7,
			businessRationale: 'Observed.',
			researchFeasibility: 0.7,
			researchRationale: 'Page exists.',
		};
		const measured = { impressions: 821, clicks: 5, ctr: 0.006, position: 8.7, startDate: '2026-10-20', endDate: '2026-11-17' };
		const page = scoreOpportunity({ demandClass: 'observed', measured: { ...measured, scope: 'page' }, ...shared });
		const query = scoreOpportunity({ demandClass: 'observed', measured: { ...measured, scope: 'query' }, ...shared });
		expect(page.components[0]?.rationale).toContain('Page total, not exact-query demand');
		expect(page.confidence).toBe('medium');
		expect(page.score).toBeLessThan(query.score);
		expect(optimisationScope({ ...measured, scope: 'page' })).toBe('metadata');
	});

	it('stores external pages as inferred demand and does not invent volume', () => {
		const [candidate] = candidatesFromMarket({
			queries: [{ query: 'how authors keep canon across a long novel', hits: [{ url: 'https://example.com/canon', title: 'Canon', snippet: 'Authors lose track of facts.', publishedAt: '2026-11-01' }] }],
			inventory,
			brandHost: 'folian.app',
			retrievedAt: '2026-11-17T00:00:00.000Z',
		});
		expect(candidate?.demandClass).toBe('inferred');
		expect(candidate?.evidence[0]?.url).toBe('https://example.com/canon');
		expect(candidate?.evidence[0]?.metrics).toBeNull();
		expect(candidate?.forcedOverlap?.rationale).toContain('No search volume was supplied');
	});

	it('reports Search Console as unavailable until credentials exist', () => {
		expect(gscConfigured({})).toBe(false);
		const searchConsole = providerAvailability({}).find((item) => item.id === 'search_console');
		expect(searchConsole?.state).toBe('unavailable');
		expect(searchConsole?.detail).toContain('GOOGLE_SEARCH_CONSOLE_SITE_URL');
		expect(providerAvailability({}).find((item) => item.id === 'analytics')?.state).toBe('unavailable');
	});
});
