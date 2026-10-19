import 'server-only';

import { getNativeContentStore } from '@/lib/media/store';

function isPublicHttpsUrl(url: string): boolean {
	try {
		return new URL(url).protocol === 'https:';
	} catch {
		return false;
	}
}

/** First linked image asset URL for a content or article row, scoped to brand when provided. */
export async function resolveLinkedImageUrlForTarget(input: {
	ownerUserId: string;
	targetType: 'content' | 'article';
	targetId: string;
	brandBrainId?: string;
}): Promise<string | null> {
	const store = getNativeContentStore();
	const links = await store.listLinks(input.ownerUserId, input.targetType, input.targetId);
	for (const link of links) {
		const asset = await store.getAsset(input.ownerUserId, link.assetId);
		if (!asset || asset.assetType !== 'image') continue;
		if (input.brandBrainId && asset.brandId && asset.brandId !== input.brandBrainId) continue;
		const url = asset.url?.trim();
		if (url && isPublicHttpsUrl(url)) return url;
	}
	return null;
}
