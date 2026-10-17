import { describe, expect, it } from 'vitest';
import { rankAssetsForTopic } from '../assetMatching';
import type { PublicAsset } from '../types';
import type { AssetVisionAnalysis } from '../assetVisionTypes';

const base: PublicAsset = {
	id: 'a1',
	assetType: 'image',
	sourceType: 'upload',
	approvalStatus: 'draft',
	verifiedReference: true,
	libraryType: 'PRODUCT_PHOTO',
	title: 'Shelf display',
};

describe('assetMatching', () => {
	it('ranks assets using vision tags and entities for a diecast topic', () => {
		const vision: AssetVisionAnalysis = {
			summary: 'Red Ferrari diecast model on a display stand.',
			subjects: ['diecast car', 'display stand'],
			brandEntities: ['1:18 scale', 'Ferrari'],
			setting: 'Retail shelf',
			colours: ['red'],
			mood: 'Premium',
			orientation: 'landscape',
			cropSuitability: 'Works for Instagram feed crop',
			suggestedTopics: ['New arrivals', 'Ferrari diecast collection'],
			altText: 'Red Ferrari diecast model on a stand',
			searchTags: ['ferrari', 'diecast', 'scale-model'],
			analyzedAt: new Date().toISOString(),
		};
		const ranked = rankAssetsForTopic(
			'Ferrari diecast new arrival Instagram',
			[base, { ...base, id: 'a2', title: 'Office desk', verifiedReference: true, libraryType: 'OTHER' }],
			new Map([[base.id, vision]]),
		);
		expect(ranked[0]?.asset.id).toBe('a1');
		expect(ranked[0]?.score).toBeGreaterThan(2);
		expect(ranked[0]?.matchReason).toMatch(/Matched words|Vision summary/i);
	});
});
