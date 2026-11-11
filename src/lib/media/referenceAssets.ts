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

function looksLikeProductScreenshot(asset: Pick<ContentAssetRecord, 'libraryType' | 'title' | 'description' | 'tags' | 'sourceType'>): boolean {
	if (asset.libraryType && PRODUCT_TYPES.has(asset.libraryType)) return true;
	const haystack = `${asset.title || ''} ${asset.description || ''} ${(asset.tags || []).join(' ')}`.toLowerCase();
	return /screenshot|product ui|app interface|dashboard|planner|editor|workspace/.test(haystack);
}

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
	const wantsProduct = /interface|screenshot|product|app|editor|workspace|laptop|screen|planner/i.test(query);
	const scored = new Map(rankAssetsForTopic(query, scoped.map(publicAsset), visionByAssetId).map((row) => [row.asset.id, row]));
	const ranked = scoped
		.map((source) => {
			const base = scored.get(source.id) ?? { asset: publicAsset(source), score: 0, matchReason: 'Brand library asset' };
			const libraryType = (source.libraryType as LibraryAssetType | undefined) ?? 'OTHER';
			const isProduct = looksLikeProductScreenshot(source);
			const uploaded = source.sourceType === 'upload' || source.sourceType === 'external' || Boolean(source.verifiedReference);
			const generated = source.sourceType === 'generated';
			let score = base.score;
			if (isProduct) score += wantsProduct ? 10 : 2;
			if (uploaded) score += 4;
			if (generated) score -= 8;
			if (libraryType === 'LOGO' || libraryType === 'BRAND_MARK') score -= wantsProduct ? 2 : 0;
			return {
				asset: base.asset,
				score,
				matchReason: base.matchReason,
				libraryType,
				isProduct,
				uploaded,
			};
		})
		.sort((a, b) => b.score - a.score);
	const nonGenerated = ranked.filter((row) => row.asset.sourceType !== 'generated');
	const preferred = nonGenerated.filter((row) => row.uploaded || row.isProduct);
	const pool = preferred.length ? preferred : nonGenerated.length ? nonGenerated : ranked;
	return pool.slice(0, input.limit ?? 8).map((row, index) => {
		const libraryType = row.isProduct && row.libraryType === 'OTHER' ? 'PRODUCT_SCREENSHOT' : row.libraryType;
		const isProduct = row.isProduct;
		return {
			asset: row.asset,
			score: row.score,
			matchReason: row.matchReason,
			libraryType,
			recommended: (wantsProduct && isProduct && index < 2) || (!wantsProduct && row.uploaded && index === 0),
		};
	});
}

export function brandHasProductScreenshot(assets: ContentAssetRecord[]): boolean {
	return assets.some((asset) => looksLikeProductScreenshot(asset));
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
