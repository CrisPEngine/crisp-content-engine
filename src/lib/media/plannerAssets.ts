import { bestAssetForTopic } from './assetMatching';
import type { AssetVisionAnalysis } from './assetVisionTypes';
import { publicAsset } from './images';
import type { ContentAssetRecord, PublicAsset } from './types';

export function publicAssetsWithVision(assets: ContentAssetRecord[]): {
	publicAssets: PublicAsset[];
	visionByAssetId: Map<string, AssetVisionAnalysis>;
} {
	const visionByAssetId = new Map<string, AssetVisionAnalysis>();
	for (const asset of assets) {
		if (asset.visionAnalysis) visionByAssetId.set(asset.id, asset.visionAnalysis);
	}
	return { publicAssets: assets.map(publicAsset), visionByAssetId };
}

export function pickBestLibraryAsset(topic: string, assets: ContentAssetRecord[]) {
	const { publicAssets, visionByAssetId } = publicAssetsWithVision(assets);
	return bestAssetForTopic(topic, publicAssets, visionByAssetId);
}
