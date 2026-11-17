import { beforeEach, describe, expect, it } from 'vitest';
import { setNativeContentStoreForTests, createMemoryNativeContentStore } from '@/lib/media/store';
import type { ArticleRecord } from '@/lib/articles/types';
import { syncPayloadCatalogue } from '@/lib/publishing/cmsSync';
import { metadataApplyDecision, prepareMetadataPublish } from '@/lib/publishing/payloadCatalogue';
import { researchAreaQueries } from '@/lib/campaigns/market';

const doc = {
	id: 12,
	title: 'ChatGPT for Novel Writing',
	slug: 'chatgpt-for-novel-writing',
	dek: 'Original description',
	externalId: 'catalog:chatgpt-for-novel-writing',
	_status: 'published',
	publishedAt: null,
	updatedAt: '2026-10-28T19:01:04.346Z',
	createdAt: '2026-10-27T19:14:54.015Z',
	hero: null,
	revision: 2,
};

beforeEach(() => setNativeContentStoreForTests(createMemoryNativeContentStore()));

describe('payload catalogue sync', () => {
	it('imports once and keeps a local draft body when Payload changes', async () => {
		const first = await syncPayloadCatalogue('user-a', 'brand-a', [doc]);
		expect(first.created).toBe(1);
		const listed = await (await import('@/lib/media/store')).getNativeContentStore().listArticles('user-a', 'brand-a');
		expect(listed).toHaveLength(1);
		listed[0].body = 'Local revision history';
		listed[0].workspace = { ...(listed[0].workspace as object), revision: { id: 'r1' } } as ArticleRecord['workspace'];
		await (await import('@/lib/media/store')).getNativeContentStore().saveArticle(listed[0]);
		const second = await syncPayloadCatalogue('user-a', 'brand-a', [{ ...doc, updatedAt: '2026-11-01T00:00:00.000Z', title: 'Changed in Payload' }]);
		expect(second.created).toBe(0);
		expect(second.updated).toBe(1);
		const after = await (await import('@/lib/media/store')).getNativeContentStore().getArticle('user-a', listed[0].id);
		expect(after?.body).toBe('Local revision history');
		expect(after?.title).toBe('ChatGPT for Novel Writing');
		expect(after?.library?.cms?.title).toBe('Changed in Payload');
	});

	it('links a metadata proposal to the canonical record without publishing', async () => {
		const store = (await import('@/lib/media/store')).getNativeContentStore();
		await store.saveArticle({
			id: 'proposal',
			ownerUserId: 'user-a',
			brandId: 'brand-a',
			title: 'Update proposal',
			status: 'review',
			body: '# Metadata proposal\nSource: https://folian.app/articles/chatgpt-for-novel-writing\nProposed title: ChatGPT for Novel Writing: Uses & Limits | Folian\nProposed description: Explore how ChatGPT can help.',
			approval: { status: 'pending' },
			publication: null,
			updatedAt: '2026-11-17T00:00:00.000Z',
			createdAt: '2026-11-17T00:00:00.000Z',
		} as ArticleRecord);
		const result = await syncPayloadCatalogue('user-a', 'brand-a', [doc]);
		expect(result.linkedProposals).toBe(1);
		const proposal = await store.getArticle('user-a', 'proposal');
		expect(proposal?.library?.canonicalArticleId).toBeTruthy();
		expect(proposal?.status).toBe('review');
		const again = await syncPayloadCatalogue('user-a', 'brand-a', [doc]);
		expect(again.created).toBe(0);
		expect(again.linkedProposals).toBe(0);
	});

	it('refuses to apply an unapproved or stale proposal and never sends a live write', () => {
		expect(metadataApplyDecision({ approved: false, baseUpdatedAt: 'a', currentUpdatedAt: 'a', live: true }).apply).toBe(false);
		expect(metadataApplyDecision({ approved: true, baseUpdatedAt: 'a', currentUpdatedAt: 'b', live: true }).apply).toBe(false);
		expect(metadataApplyDecision({ approved: true, baseUpdatedAt: 'a', currentUpdatedAt: 'a', live: false })).toMatchObject({ apply: false });
		expect(prepareMetadataPublish({ proposalStatus: null, baseUpdatedAt: null, currentUpdatedAt: '2026-10-28T19:01:04.346Z' })).toMatchObject({ apply: false, sent: false });
		expect(prepareMetadataPublish({ proposalStatus: 'pending', baseUpdatedAt: '2026-10-28T19:01:04.346Z', currentUpdatedAt: '2026-10-28T19:01:04.346Z' }).apply).toBe(false);
	});

	it('turns research areas into questions rather than article titles', () => {
		expect(researchAreaQueries(['Character continuity', 'Story bible management'])[0]).toContain('problems fiction writers');
		expect(researchAreaQueries(['Character continuity'])[0]).not.toBe('Character continuity');
	});
});
