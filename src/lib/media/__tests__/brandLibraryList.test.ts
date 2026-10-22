import { describe, expect, it } from 'vitest';
import { assetThumbnailUrl, filterBrandLibraryAssets } from '../brandLibraryList';
import type { ContentAssetRecord } from '../types';

function row(partial: Partial<ContentAssetRecord>): ContentAssetRecord {
	return {
		id: partial.id ?? '1',
		ownerUserId: 'user',
		assetType: 'image',
		sourceType: partial.sourceType ?? 'upload',
		storageProvider: 'cloudinary',
		providerAssetId: 'pid',
		provenance: {},
		approvalStatus: 'draft',
		createdAt: '',
		updatedAt: '',
		...partial,
	};
}

describe('filterBrandLibraryAssets', () => {
	it('defaults to uploads only', () => {
		const assets = [
			row({ id: 'u1', sourceType: 'upload' }),
			row({ id: 'g1', sourceType: 'generated' }),
		];
		expect(filterBrandLibraryAssets(assets, 'upload').map((a) => a.id)).toEqual(['u1']);
	});

	it('can list generated assets separately', () => {
		const assets = [row({ id: 'u1', sourceType: 'upload' }), row({ id: 'g1', sourceType: 'generated' })];
		expect(filterBrandLibraryAssets(assets, 'generated').map((a) => a.id)).toEqual(['g1']);
	});
});

describe('assetThumbnailUrl', () => {
	it('adds Cloudinary resize transform', () => {
		const url = 'https://res.cloudinary.com/demo/image/upload/v1/folder/photo.jpg';
		expect(assetThumbnailUrl(url)).toContain('c_limit,w_800');
	});
});
