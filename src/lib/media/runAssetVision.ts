import { embedAssetRecord } from './assetEmbeddings';
import { analyzeAssetImage, assetVisionStatus } from './assetVision';
import type { ContentAssetRecord } from './types';
import { getNativeContentStore } from './store';

export async function runAssetVisionAnalysis(input: {
	ownerUserId: string;
	assetId: string;
	brandName?: string;
	force?: boolean;
}): Promise<ContentAssetRecord | null> {
	const store = getNativeContentStore();
	const asset = await store.getAsset(input.ownerUserId, input.assetId);
	if (!asset?.url) return null;
	if (asset.visionUserLocked && !input.force) return asset;
	if (asset.visionAnalysisStatus === 'complete' && asset.visionAnalysis && !input.force) return asset;

	const pending: ContentAssetRecord = {
		...asset,
		visionAnalysisStatus: 'pending',
		updatedAt: new Date().toISOString(),
	};
	await store.saveAsset(pending);

	if (!assetVisionStatus().configured) {
		return store.saveAsset({
			...pending,
			visionAnalysisStatus: 'skipped',
			updatedAt: new Date().toISOString(),
		});
	}

	const analysis = await analyzeAssetImage({
		imageUrl: asset.url,
		brandName: input.brandName,
		libraryType: asset.libraryType,
		productFeature: asset.productFeature,
		userTitle: asset.title,
	});

	if (!analysis) {
		return store.saveAsset({
			...pending,
			visionAnalysisStatus: 'failed',
			updatedAt: new Date().toISOString(),
		});
	}

	const mergedTags = Array.from(new Set([...(asset.tags ?? []), ...analysis.searchTags])).slice(0, 40);
	const withVision: ContentAssetRecord = {
		...asset,
		visionAnalysis: analysis,
		visionAnalysisStatus: 'complete',
		description: asset.visionUserLocked ? asset.description : asset.description || analysis.summary,
		altText: asset.visionUserLocked ? asset.altText : asset.altText || analysis.altText,
		tags: asset.visionUserLocked ? asset.tags : mergedTags,
		updatedAt: new Date().toISOString(),
	};
	const embedded = await embedAssetRecord(withVision);
	if (embedded) {
		withVision.searchEmbedding = embedded.embedding;
		withVision.embeddingModel = embedded.model;
		withVision.embeddingUpdatedAt = new Date().toISOString();
	}
	return store.saveAsset(withVision);
}
