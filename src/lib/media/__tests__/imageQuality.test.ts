import { describe, expect, it } from 'vitest';
import { assessGeneratedImageQuality } from '@/lib/media/imageQuality';
import { proposeReferenceAssets } from '@/lib/media/referenceAssets';
import { resolveImageModelId, imageModelReport } from '@/lib/media/imageModels';
import type { ContentAssetRecord } from '@/lib/media/types';

describe('imageQuality and references', () => {
	it('flags anatomical concerns from vision summaries', () => {
		const findings = assessGeneratedImageQuality({
			vision: {
				summary: 'A person with a malformed hand holding a pen',
				subjects: ['writer'],
				brandEntities: [],
				setting: 'cafe',
				colours: [],
				mood: 'calm',
				orientation: 'landscape',
				cropSuitability: 'hero',
				suggestedTopics: [],
				suggestedChannels: [],
				detectedText: [],
				altText: 'Writer in a cafe',
				searchTags: [],
				analyzedAt: new Date().toISOString(),
			},
			concept: 'writer in cafe',
		});
		expect(findings.some((finding) => finding.code === 'anatomy_concern' && finding.severity === 'blocking')).toBe(true);
	});

	it('isolates reference proposals to the requested brand', () => {
		const assets = [
			{
				id: 'a1',
				ownerUserId: 'u',
				brandId: 'brand-a',
				assetType: 'image',
				sourceType: 'upload',
				storageProvider: 'cloudinary',
				url: 'https://example.com/a.jpg',
				title: 'Writing interface screenshot',
				libraryType: 'PRODUCT_SCREENSHOT',
				verifiedReference: true,
				referenceAllowed: true,
				provenance: {},
				approvalStatus: 'approved',
				createdAt: '',
				updatedAt: '',
			},
			{
				id: 'b1',
				ownerUserId: 'u',
				brandId: 'brand-b',
				assetType: 'image',
				sourceType: 'upload',
				storageProvider: 'cloudinary',
				url: 'https://example.com/b.jpg',
				title: 'Writing interface screenshot',
				libraryType: 'PRODUCT_SCREENSHOT',
				verifiedReference: true,
				referenceAllowed: true,
				provenance: {},
				approvalStatus: 'approved',
				createdAt: '',
				updatedAt: '',
			},
		] as ContentAssetRecord[];
		const proposals = proposeReferenceAssets({
			brandId: 'brand-a',
			concept: 'laptop showing writing interface in a cafe',
			topic: 'how to start writing a book',
			assets,
		});
		expect(proposals.every((row) => row.asset.brandId === 'brand-a')).toBe(true);
		expect(proposals.some((row) => row.asset.id === 'b1')).toBe(false);
	});

	it('resolves a configurable production image model without auto-switching', () => {
		expect(resolveImageModelId('gpt-image-1')).toBe('gpt-image-2.5-flare');
		const report = imageModelReport();
		expect(report.provider).toBe('openai');
		expect(report.endpoints.generate).toMatch(/images\/generations/);
		expect(report.selectedModel).toBeTruthy();
	});
});
