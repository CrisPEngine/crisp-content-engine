import { describe, expect, it } from 'vitest';
import { canDeleteDraft, canPermanentDelete, canUnpublish, contentStage, paginate, publicRemovalReport } from '@/lib/articles/library';
import { archiveArticle, deleteDraftArticle } from '@/lib/articles/libraryActions';
import { createMemoryNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import type { ArticleRecord } from '@/lib/articles/types';
import { filterOpportunities, queuePage, shouldArchiveOpportunity } from '@/lib/campaigns/queue';
import { contextOnly } from '@/lib/campaigns/market';
import { finishProposalJob } from '@/lib/campaigns/workflow';
import { createMemoryOpportunityRepository, setOpportunityRepositoryForTests } from '@/lib/campaigns/repository';
import type { ContentOpportunity, ProductionJob } from '@/lib/campaigns/types';

function article(patch: Partial<ArticleRecord>): ArticleRecord {
	return {
		id: 'a1',
		ownerUserId: 'user-a',
		brandId: 'brand-a',
		title: 'Disposable draft',
		status: 'draft',
		body: 'Draft body',
		publication: null,
		library: undefined,
		internalLinkOpportunities: [],
		workspace: { cms: { lastSyncAt: null, externalId: null } },
		...patch,
	} as ArticleRecord;
}

function opportunity(patch: Partial<ContentOpportunity>): ContentOpportunity {
	return {
		id: 'o1',
		brandId: 'brand-a',
		campaignId: null,
		title: 'Writers lose track of canon',
		audienceProblem: 'Authors lose track of facts.',
		searchIntent: 'informational',
		demandClass: 'inferred',
		evidenceConfidence: 'medium',
		score: 0.4,
		scoreDetail: { score: 0.4, confidence: 'medium', components: [], promotionBlocked: true, blockReason: 'Not validated.' },
		overlap: { decision: 'research', overlap: 0, matchedArticleId: null, matchedTitle: null, rationale: 'Needs research.' },
		recommendedAction: 'research',
		status: 'discovered',
		discoverySource: 'search',
		evidence: [],
		createdAt: '2026-11-17T00:00:00.000Z',
		updatedAt: '2026-11-17T00:00:00.000Z',
		...patch,
	};
}

describe('content library and queue', () => {
	it('archives and restores a draft without treating it as published', async () => {
		const store = createMemoryNativeContentStore();
		setNativeContentStoreForTests(store);
		await store.saveArticle(article({}));
		const archived = await archiveArticle('user-a', 'a1');
		expect(contentStage(archived)).toBe('archived');
		expect(archived.publication).toBeNull();
		const other = article({ id: 'published', status: 'published', publication: { url: 'https://folian.app/articles/live' } as ArticleRecord['publication'] });
		expect(canUnpublish(other, {}).allowed).toBe(false);
		expect(publicRemovalReport(other).warnings.join(' ')).toContain('public URL');
	});

	it('deletes an unpublished draft and keeps a shared asset', async () => {
		const store = createMemoryNativeContentStore();
		setNativeContentStoreForTests(store);
		await store.saveArticle(article({}));
		await store.saveAsset({ id: 'asset-1', ownerUserId: 'user-a', brandId: 'brand-a' } as never);
		await store.saveLink({ ownerUserId: 'user-a', assetId: 'asset-1', targetType: 'article', targetId: 'a1' } as never);
		await store.saveLink({ ownerUserId: 'user-a', assetId: 'asset-1', targetType: 'article', targetId: 'other' } as never);
		await deleteDraftArticle('user-a', 'a1', 'Disposable draft');
		expect(await store.getArticle('user-a', 'a1')).toBeNull();
		expect(await store.getAsset('user-a', 'asset-1')).not.toBeNull();
		await expect(deleteDraftArticle('user-b', 'a1', 'Disposable draft')).rejects.toThrow(/not found/i);
	});

	it('refuses permanent deletion of a published article', () => {
		const live = article({ status: 'published', publication: { url: 'https://folian.app/articles/live' } as ArticleRecord['publication'] });
		expect(canPermanentDelete(live, live.title).allowed).toBe(false);
		expect(canDeleteDraft(live).allowed).toBe(false);
	});

	it('paginates and filters opportunities without showing archived rows by default', () => {
		const rows = [
			opportunity({ id: '1', title: 'Alpha' }),
			opportunity({ id: '2', title: 'Beta', status: 'archived' }),
			opportunity({ id: '3', title: 'Gamma', demandClass: 'observed', recommendedAction: 'update', scoreDetail: { score: 0.6, confidence: 'medium', components: [], promotionBlocked: false, blockReason: null } }),
		];
		expect(filterOpportunities(rows, {}).map((row) => row.id)).toEqual(['1', '3']);
		expect(queuePage(rows, { page: 1, pageSize: 5 }).total).toBe(2);
		expect(shouldArchiveOpportunity(rows[0]!)).toBe(true);
		expect(shouldArchiveOpportunity(rows[2]!)).toBe(false);
	});

	it('does not treat an interview as audience demand', () => {
		expect(contextOnly({ url: 'https://www.newyorker.com/chatgpt', title: 'What kind of writer is ChatGPT', snippet: 'Tyler Cowen talks with me about AI.' })).toBe(true);
		expect(contextOnly({ url: 'https://example.com/canon', title: 'Writers lose track of canon', snippet: 'Authors lose track of facts.' })).toBe(false);
	});

	it('completes a proposal job on approval and does not publish', async () => {
		const repository = createMemoryOpportunityRepository();
		setOpportunityRepositoryForTests(repository);
		const job: ProductionJob = {
			id: 'job-1',
			brandId: 'brand-a',
			campaignId: null,
			opportunityId: 'opp',
			articleId: 'proposal-1',
			stage: 'approval',
			status: 'ready_for_approval',
			attempt: 1,
			note: 'Waiting',
			error: null,
			costUsd: 0.003,
			stageLog: [],
			createdAt: '2026-11-17T00:00:00.000Z',
			updatedAt: '2026-11-17T00:00:00.000Z',
		};
		await repository.saveJob('user-a', job);
		const finished = await finishProposalJob('user-a', 'proposal-1', 'approved');
		expect(finished?.status).toBe('completed');
		expect(finished?.note).toContain('Nothing was published');
		expect(paginate([1, 2, 3], 2, 2).rows).toEqual([3]);
	});
});
