import { beforeEach, describe, expect, it } from 'vitest';
import { getNativeContentStore, setNativeContentStoreForTests } from '@/lib/media/store';
import { resolveApprovalPublishImagePreview } from '@/lib/publish/approvalPublishImage';

describe('resolveApprovalPublishImagePreview', () => {
	beforeEach(() => {
		setNativeContentStoreForTests();
	});

	it('matches Threads publish image from the first linked asset', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-1',
			ownerUserId: 'user-1',
			assetType: 'image',
			sourceType: 'generated',
			storageProvider: 'cloudinary',
			url: 'https://res.cloudinary.com/demo/threads.jpg',
			altText: 'Product on a desk',
			provenance: {},
			approvalStatus: 'draft',
			createdAt: now,
			updatedAt: now,
		});
		await store.saveLink({
			id: 'link-1',
			ownerUserId: 'user-1',
			assetId: 'asset-1',
			targetType: 'content',
			targetId: 'mem-1',
			createdAt: now,
		});

		const preview = await resolveApprovalPublishImagePreview({
			ownerUserId: 'user-1',
			targetType: 'content',
			targetId: 'mem-1',
			channel: 'threads',
			metadata: { imageReferenceUrl: 'https://legacy.example/old.jpg' },
		});

		expect(preview).toEqual({
			url: 'https://res.cloudinary.com/demo/threads.jpg',
			altText: 'Product on a desk',
			label: 'Image that will be posted',
		});
	});

	it('falls back to metadata image url for Threads when no linked asset', async () => {
		const preview = await resolveApprovalPublishImagePreview({
			ownerUserId: 'user-1',
			targetType: 'content',
			targetId: 'mem-2',
			channel: 'Threads',
			metadata: { image_reference_url: 'https://cdn.example/fallback.png' },
		});

		expect(preview).toEqual({
			url: 'https://cdn.example/fallback.png',
			altText: undefined,
			label: 'Image that will be posted',
		});
	});

	it('returns the first linked image for articles', async () => {
		const store = getNativeContentStore();
		const now = new Date().toISOString();
		await store.saveAsset({
			id: 'asset-a',
			ownerUserId: 'user-1',
			assetType: 'image',
			sourceType: 'upload',
			storageProvider: 'cloudinary',
			url: 'https://res.cloudinary.com/demo/article-hero.jpg',
			title: 'Hero illustration',
			provenance: {},
			approvalStatus: 'approved',
			createdAt: now,
			updatedAt: now,
		});
		await store.saveLink({
			id: 'link-a',
			ownerUserId: 'user-1',
			assetId: 'asset-a',
			targetType: 'article',
			targetId: 'art-1',
			createdAt: now,
		});

		const preview = await resolveApprovalPublishImagePreview({
			ownerUserId: 'user-1',
			targetType: 'article',
			targetId: 'art-1',
		});

		expect(preview).toEqual({
			url: 'https://res.cloudinary.com/demo/article-hero.jpg',
			altText: 'Hero illustration',
			label: 'Attached image',
		});
	});
});
