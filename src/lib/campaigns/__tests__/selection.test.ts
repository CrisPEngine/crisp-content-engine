import { describe, expect, it } from 'vitest';
import { selectObservedOpportunities } from '@/lib/campaigns/selection';
import type { InventoryArticle } from '@/lib/campaigns/types';

const inventory: InventoryArticle[] = [{
	id: 'article-1',
	title: 'How to Plan a Novel With AI',
	topic: 'plan a novel with ai',
	keyword: 'plan a novel with ai',
	intent: 'informational',
	status: 'published',
	url: 'https://folian.app/articles/how-to-plan-a-novel-with-ai',
}];

describe('observed opportunity selection', () => {
	it('attributes a weak existing page to update and does not invent volume', () => {
		const [candidate] = selectObservedOpportunities({
			siteUrl: 'sc-domain:folian.app',
			startDate: '2026-10-20',
			endDate: '2026-11-17',
			retrievedAt: '2026-11-17T00:00:00.000Z',
			queries: [{ query: 'how to plan a novel with ai', impressions: 272, clicks: 2, ctr: 0.007, position: 8.8 }],
			queryPages: [{ query: 'how to plan a novel with ai', page: 'https://folian.app/articles/how-to-plan-a-novel-with-ai', impressions: 272, clicks: 2, ctr: 0.007, position: 8.8 }],
			pages: [],
			inventory,
			brandTerms: ['Folian'],
			verifiedCapabilities: ['Story Bible'],
			landingPages: [{ landingPage: '/articles/how-to-plan-a-novel-with-ai', sessions: 1, engagementRate: 1, averageSessionDuration: 36, keyEvents: 0 }],
		});
		expect(candidate?.demandClass).toBe('observed');
		expect(candidate?.forcedOverlap?.decision).toBe('update');
		expect(candidate?.forcedOverlap?.matchedArticleId).toBe('article-1');
		expect(candidate?.evidence.find((item) => item.sourceKind === 'ga4')?.metrics).toBeNull();
		expect(candidate?.evidence.find((item) => item.sourceKind === 'ga4')?.excerpt).toContain('not search demand');
		expect(candidate?.brandRationale).toContain('does not invent');
	});

	it('rejects a brand query that already reaches the homepage', () => {
		const [candidate] = selectObservedOpportunities({
			siteUrl: 'sc-domain:folian.app',
			startDate: '2026-10-20',
			endDate: '2026-11-17',
			retrievedAt: '2026-11-17T00:00:00.000Z',
			queries: [{ query: 'folian', impressions: 150, clicks: 6, ctr: 0.04, position: 2.8 }],
			queryPages: [{ query: 'folian', page: 'https://folian.app/', impressions: 150, clicks: 6, ctr: 0.04, position: 2.8 }],
			pages: [],
			inventory,
			brandTerms: ['Folian'],
			verifiedCapabilities: [],
		});
		expect(candidate?.forcedOverlap?.decision).toBe('reject');
	});

	it('keeps a long-tail query for research instead of discarding it', () => {
		const [candidate] = selectObservedOpportunities({
			siteUrl: 'sc-domain:folian.app',
			startDate: '2026-10-20',
			endDate: '2026-11-17',
			retrievedAt: '2026-11-17T00:00:00.000Z',
			queries: [{ query: 'ai memory system for writers', impressions: 6, clicks: 0, ctr: 0, position: 39 }],
			queryPages: [],
			pages: [],
			inventory,
			brandTerms: ['Folian'],
			verifiedCapabilities: [],
		});
		expect(candidate?.forcedOverlap?.decision).toBe('research');
		expect(candidate?.evidence[0]?.metrics?.scope).toBe('query');
	});

	it('adds a page total when queries are too fragmented to represent it', () => {
		const candidates = selectObservedOpportunities({
			siteUrl: 'sc-domain:folian.app',
			startDate: '2026-10-20',
			endDate: '2026-11-17',
			retrievedAt: '2026-11-17T00:00:00.000Z',
			queries: [{ query: 'chatgpt novel writing', impressions: 1, clicks: 1, ctr: 1, position: 4 }],
			queryPages: [],
			pages: [{ page: 'https://folian.app/articles/chatgpt-for-novel-writing', impressions: 770, clicks: 5, ctr: 0.0065, position: 8.8 }],
			inventory: [],
			brandTerms: ['Folian'],
			verifiedCapabilities: [],
		});
		expect(candidates.map((item) => item.title)).toEqual(['chatgpt for novel writing']);
		expect(candidates[0]?.evidence[0]?.excerpt).toContain('Page total');
		expect(candidates[0]?.forcedOverlap?.decision).toBe('update');
	});

	it('keeps a distinct low-impression query eligible instead of treating 50 impressions as a veto', () => {
		const [candidate] = selectObservedOpportunities({
			siteUrl: 'sc-domain:folian.app',
			startDate: '2026-10-20',
			endDate: '2026-11-17',
			retrievedAt: '2026-11-17T00:00:00.000Z',
			queries: [{ query: 'ai fiction writing and scene continuation assistant', impressions: 23, clicks: 0, ctr: 0, position: 7.3 }],
			queryPages: [],
			pages: [],
			inventory,
			brandTerms: ['Folian'],
			verifiedCapabilities: ['Story Bible'],
		});
		expect(candidate?.forcedOverlap?.decision).toBe('create');
		expect(candidate?.forcedOverlap?.rationale).toMatch(/below 50/);
		expect(JSON.stringify(candidate)).not.toMatch(/volume/i);
	});
});
