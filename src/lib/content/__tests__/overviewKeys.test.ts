import { describe, expect, it } from 'vitest';
import { buildContentOverview } from '@/lib/content/overview';

describe('content overview action identities', () => {
	it('keeps a unique id when two actions share a title and url', () => {
		const view = buildContentOverview({
			paused: true,
			publishingEnabled: false,
			started: 0,
			remaining: 2,
			nextSlotAt: null,
			weeklyMaximum: 2,
			opportunities: [{ id: 'opp-shared', title: 'Same title', status: 'approved', recommendedAction: 'create' }],
			jobs: [
				{ id: 'job-a', opportunityId: 'opp-shared', articleId: 'article-1', stage: 'corrections', status: 'needs_attention', note: 'Needs a decision', error: null },
				{ id: 'job-b', opportunityId: 'opp-shared', articleId: 'article-1', stage: 'draft', status: 'ready_for_approval', note: 'Waiting', error: null },
			],
			articles: [{ id: 'article-1', title: 'Same title', status: 'draft', updatedAt: '2026-11-27T00:00:00.000Z' }],
		});
		const ids = [...view.actions, ...view.activity, ...view.failures].map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(view.actions.map((item) => item.id)).toEqual(['job:job-a:attention', 'job:job-b:approval', 'opportunity:opp-shared']);
		expect(view.actions.filter((item) => item.href === '/content/articles/article-1' && item.title === 'Same title')).toHaveLength(2);
	});
});
