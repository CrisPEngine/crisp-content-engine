import { describe, expect, it } from 'vitest';
import { eligibleLibraryAsset, isStaleScreenshot, rankAssetsForGeneration, recentlyUsedOnChannel } from '../assetSelection';
import type { ContentAssetRecord } from '../types';

function asset(overrides: Partial<ContentAssetRecord> = {}): ContentAssetRecord {
	const now = new Date().toISOString();
	return {
		id: overrides.id ?? 'a1',
		ownerUserId: 'user',
		brandId: 'brand-1',
		assetType: 'image',
		sourceType: 'upload',
		storageProvider: 'cloudinary',
		url: 'https://cdn.example.com/photo.jpg',
		provenance: {},
		approvalStatus: 'approved',
		libraryType: 'PRODUCT_PHOTO',
		title: 'Ferrari 488 diecast',
		tags: ['ferrari', 'red'],
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe('assetSelection', () => {
	it('requires approved real library assets', () => {
		expect(eligibleLibraryAsset(asset())).toBe(true);
		expect(eligibleLibraryAsset(asset({ approvalStatus: 'draft' }))).toBe(false);
		expect(eligibleLibraryAsset(asset({ sourceType: 'generated' }))).toBe(false);
	});

	it('flags stale product screenshots', () => {
		const old = asset({
			libraryType: 'PRODUCT_SCREENSHOT',
			createdAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
		});
		expect(isStaleScreenshot(old)).toBe(true);
	});

	it('ranks topic matches above unrelated assets', async () => {
		const ferrari = asset({ id: 'ferrari', title: 'Ferrari 488 GTB 1:18', tags: ['ferrari'] });
		const porsche = asset({ id: 'porsche', title: 'Porsche 911', tags: ['porsche'] });
		const ranked = await rankAssetsForGeneration({
			ownerUserId: 'user',
			brandId: 'brand-1',
			channel: 'INSTAGRAM_FEED',
			topic: 'New Ferrari listing in 1:18 scale',
			assets: [porsche, ferrari],
			visionByAssetId: new Map(),
			recentLinks: [],
		});
		expect(ranked[0]?.asset.id).toBe('ferrari');
	});

	it('blocks assets reused recently on the same channel', () => {
		const links = [
			{
				id: 'link-1',
				ownerUserId: 'user',
				assetId: 'ferrari',
				targetType: 'content' as const,
				targetId: 'post-1',
				createdAt: new Date().toISOString(),
			},
		];
		expect(
			recentlyUsedOnChannel('ferrari', 'INSTAGRAM_FEED', links, new Map([['post-1', 'instagram']])),
		).toBe(true);
		expect(
			recentlyUsedOnChannel('ferrari', 'LINKEDIN_PERSONAL', links, new Map([['post-1', 'instagram']])),
		).toBe(false);
	});
});
