import type { ContentAssetRecord } from './types';

export type BrandLibrarySourceFilter = 'upload' | 'generated' | 'all';

export function filterBrandLibraryAssets(
	assets: ContentAssetRecord[],
	source: BrandLibrarySourceFilter,
): ContentAssetRecord[] {
	if (source === 'all') return assets;
	if (source === 'generated') return assets.filter((asset) => asset.sourceType === 'generated');
	return assets.filter((asset) => asset.sourceType === 'upload');
}

/** Smaller Cloudinary delivery for library thumbnails (mobile-friendly). */
export function assetThumbnailUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	if (!url.includes('res.cloudinary.com/') || !url.includes('/upload/')) return url;
	if (url.includes('/upload/c_limit,') || url.includes('/upload/f_auto,')) return url;
	return url.replace('/upload/', '/upload/c_limit,w_800,f_auto,q_auto/');
}
