import { publicAsset } from './images';
import { rankAssetsForTopic } from './assetMatching';
import type { ContentAssetRecord, LibraryAssetType, PublicAsset } from './types';

export type ReferenceAssetProposal = {
	asset: PublicAsset;
	score: number;
	matchReason: string;
	libraryType: LibraryAssetType | 'OTHER';
	recommended: boolean;
};

const PRODUCT_TYPES = new Set<LibraryAssetType>(['PRODUCT_SCREENSHOT', 'PRODUCT_UI', 'PRODUCT_PHOTO']);

/** Rank brand-scoped library assets for an article image concept. Never crosses brands. */
export function proposeReferenceAssets(input: {
	brandId: string;
	concept: string;
	topic: string;
	title?: string;
	assets: ContentAssetRecord[];
	limit?: number;
}): ReferenceAssetProposal[] {
	const scoped = input.assets.filter((asset) => asset.brandId === input.brandId && asset.url);
	const visionByAssetId = new Map(
		scoped.filter((asset) => asset.visionAnalysis).map((asset) => [asset.id, asset.visionAnalysis!]),
	);
	const query = [input.concept, input.topic, input.title].filter(Boolean).join(' ');
	const ranked = rankAssetsForTopic(
		query,
		scoped.map(publicAsset),
		visionByAssetId,
	);
	const wantsProduct = /interface|screenshot|product|app|editor|workspace|laptop|screen/i.test(query);
	return ranked.slice(0, input.limit ?? 8).map((row, index) => {
		const libraryType = (row.asset.libraryType as LibraryAssetType | undefined) ?? 'OTHER';
		const isProduct = PRODUCT_TYPES.has(libraryType);
		return {
			asset: row.asset,
			score: row.score,
			matchReason: row.matchReason,
			libraryType,
			recommended: index === 0 || (wantsProduct && isProduct && index < 3),
		};
	});
}

export function brandAssetTypeLabel(type: string | undefined): string {
	switch (type) {
		case 'PRODUCT_SCREENSHOT':
			return 'Product screenshot';
		case 'PRODUCT_UI':
			return 'Product UI';
		case 'PRODUCT_PHOTO':
			return 'Product photograph';
		case 'LOGO':
			return 'Logo';
		case 'BRAND_MARK':
			return 'Brand mark';
		case 'BRAND_ILLUSTRATION':
		case 'BRAND_REFERENCE':
			return 'Brand illustration';
		case 'FOUNDER_PHOTO':
			return 'Founder photograph';
		case 'MARKETING_EXAMPLE':
			return 'Campaign creative';
		case 'DIAGRAM':
			return 'Diagram';
		case 'ARTICLE_IMAGE':
			return 'Lifestyle / article photograph';
		case 'SOCIAL_IMAGE':
			return 'Lifestyle photograph';
		default:
			return 'Other';
	}
}
