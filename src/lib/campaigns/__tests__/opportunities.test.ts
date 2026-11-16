import { afterEach, describe, expect, it } from 'vitest';
import { candidatesFromSearch } from '@/lib/campaigns/discovery';
import { assessOverlap } from '@/lib/campaigns/overlap';
import { fetchSearchConsoleQueries, gscConfigured, providerAvailability } from '@/lib/campaigns/providers';
import { createMemoryOpportunityRepository, setOpportunityRepositoryForTests } from '@/lib/campaigns/repository';
import { scoreOpportunity } from '@/lib/campaigns/scoring';
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

	it('reports Search Console as unavailable until credentials exist', () => {
		expect(gscConfigured({})).toBe(false);
		const searchConsole = providerAvailability({}).find((item) => item.id === 'search_console');
		expect(searchConsole?.state).toBe('unavailable');
		expect(searchConsole?.detail).toContain('GOOGLE_SEARCH_CONSOLE_SITE_URL');
	});

	it('stores only the query rows Search Console returns', async () => {
		const fetchImpl = (async () => new Response(JSON.stringify({ rows: [{ keys: ['plan a novel', 'https://folian.app/journal/plan'], clicks: 4, impressions: 80, ctr: 0.05, position: 12 }] }), { status: 200 })) as typeof fetch;
		const rows = await fetchSearchConsoleQueries({
			startDate: '2026-10-01',
			endDate: '2026-10-28',
			env: { GOOGLE_SEARCH_CONSOLE_SITE_URL: 'sc-domain:folian.app', GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN: 'token' },
			fetchImpl,
		});
		expect(rows).toEqual([{ query: 'plan a novel', page: 'https://folian.app/journal/plan', clicks: 4, impressions: 80, ctr: 0.05, position: 12 }]);
		await expect(fetchSearchConsoleQueries({ startDate: '2026-10-01', endDate: '2026-10-28', env: {} })).rejects.toMatchObject({ code: 'search_console_not_configured' });
	});
});
