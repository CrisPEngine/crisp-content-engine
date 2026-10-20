import type { AssetVisionAnalysis } from './assetVisionTypes';
import type { PublicAsset } from './types';

export type RankedAssetMatch = {
	asset: PublicAsset;
	score: number;
	matchReason: string;
};

function tokens(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2);
}

function visionText(analysis?: AssetVisionAnalysis | null): string {
	if (!analysis) return '';
	return [
		analysis.summary,
		analysis.setting,
		analysis.mood,
		analysis.cropSuitability,
		...analysis.subjects,
		...analysis.brandEntities,
		...analysis.colours,
		...analysis.suggestedTopics,
		...(analysis.suggestedChannels ?? []),
		...(analysis.detectedText ?? []),
		...analysis.searchTags,
		analysis.altText,
	].join(' ');
}

export function assetSearchText(asset: PublicAsset, vision?: AssetVisionAnalysis | null): string {
	return [
		asset.title,
		asset.altText,
		asset.caption,
		asset.description,
		asset.productFeature,
		asset.libraryType,
		...(asset.tags ?? []),
		visionText(vision),
	]
		.filter(Boolean)
		.join(' ');
}

export function scoreAssetForTopic(topic: string, asset: PublicAsset, vision?: AssetVisionAnalysis | null): { score: number; matchReason: string } {
	const wanted = tokens(topic);
	if (wanted.length === 0) return { score: 0, matchReason: 'No topic tokens to match.' };

	const haystack = tokens(assetSearchText(asset, vision));
	if (haystack.length === 0) return { score: 0, matchReason: 'Asset has no searchable text yet.' };

	const overlap = wanted.filter((word) => haystack.includes(word));
	let score = overlap.length;
	if (asset.verifiedReference) score += 1;
	const product =
		asset.libraryType === 'PRODUCT_SCREENSHOT' ||
		asset.libraryType === 'PRODUCT_UI' ||
		asset.libraryType === 'PRODUCT_PHOTO';
	if (product) score += 2;

	if (vision?.suggestedTopics?.length) {
		const topicHits = vision.suggestedTopics.filter((line) => tokens(line).some((word) => wanted.includes(word))).length;
		score += topicHits * 2;
	}
	if (vision?.brandEntities?.length) {
		const entityHits = vision.brandEntities.filter((entity) => tokens(entity).some((word) => wanted.includes(word))).length;
		score += entityHits * 3;
	}

	if (score <= 0) {
		return { score: 0, matchReason: 'No overlap between post topic and asset description or vision tags.' };
	}

	const reasonParts = [
		overlap.length ? `Matched words: ${overlap.slice(0, 6).join(', ')}` : null,
		vision?.summary ? `Vision summary: ${vision.summary}` : null,
		product ? 'Product library type boost applied.' : null,
	].filter(Boolean);

	return {
		score,
		matchReason: reasonParts.join(' '),
	};
}

export function rankAssetsForTopic(topic: string, assets: PublicAsset[], visionByAssetId?: Map<string, AssetVisionAnalysis>): RankedAssetMatch[] {
	return assets
		.map((asset) => {
			const vision = visionByAssetId?.get(asset.id);
			const { score, matchReason } = scoreAssetForTopic(topic, asset, vision);
			return { asset, score, matchReason };
		})
		.filter((row) => row.score > 0)
		.sort((a, b) => b.score - a.score);
}

export function bestAssetForTopic(
	topic: string,
	assets: PublicAsset[],
	visionByAssetId?: Map<string, AssetVisionAnalysis>,
): RankedAssetMatch | undefined {
	return rankAssetsForTopic(topic, assets, visionByAssetId)[0];
}
