import type { ArticleRecord } from '@/lib/articles/types';
import type { AssetLink, ContentAssetRecord } from './types';
import { createSupabaseNativeContentStore } from './supabaseStore';

export type NativeContentStore = {
	saveAsset(asset: ContentAssetRecord): Promise<ContentAssetRecord>;
	getAsset(ownerUserId: string, id: string): Promise<ContentAssetRecord | null>;
	listAssets(ownerUserId: string, brandId?: string): Promise<ContentAssetRecord[]>;
	saveLink(link: AssetLink): Promise<AssetLink>;
	listLinks(ownerUserId: string, targetType: string, targetId: string): Promise<AssetLink[]>;
	listLinksForAsset(ownerUserId: string, assetId: string): Promise<AssetLink[]>;
	removeLink(ownerUserId: string, assetId: string, targetType: string, targetId: string): Promise<void>;
	saveArticle(article: ArticleRecord): Promise<ArticleRecord>;
	getArticle(ownerUserId: string, id: string): Promise<ArticleRecord | null>;
};

export function createMemoryNativeContentStore(): NativeContentStore {
	const assets = new Map<string, ContentAssetRecord>();
	const links: AssetLink[] = [];
	const articles = new Map<string, ArticleRecord>();
	return {
		async saveAsset(asset) {
			assets.set(asset.id, asset);
			return asset;
		},
		async getAsset(ownerUserId, id) {
			const asset = assets.get(id);
			return asset && asset.ownerUserId === ownerUserId ? asset : null;
		},
		async listAssets(ownerUserId, brandId) {
			return [...assets.values()].filter((asset) => asset.ownerUserId === ownerUserId && (!brandId || asset.brandId === brandId));
		},
		async saveLink(link) {
			const index = links.findIndex((row) => row.ownerUserId === link.ownerUserId && row.assetId === link.assetId && row.targetType === link.targetType && row.targetId === link.targetId);
			if (index >= 0) links[index] = link;
			else links.push(link);
			return link;
		},
		async listLinks(ownerUserId, targetType, targetId) {
			return links.filter((link) => link.ownerUserId === ownerUserId && link.targetType === targetType && link.targetId === targetId);
		},
		async listLinksForAsset(ownerUserId, assetId) {
			return links.filter((link) => link.ownerUserId === ownerUserId && link.assetId === assetId);
		},
		async removeLink(ownerUserId, assetId, targetType, targetId) {
			const index = links.findIndex((link) => link.ownerUserId === ownerUserId && link.assetId === assetId && link.targetType === targetType && link.targetId === targetId);
			if (index >= 0) links.splice(index, 1);
		},
		async saveArticle(article) {
			articles.set(article.id, article);
			return article;
		},
		async getArticle(ownerUserId, id) {
			const article = articles.get(id);
			return article && article.ownerUserId === ownerUserId ? article : null;
		},
	};
}

let override: NativeContentStore | undefined;
let testStore: NativeContentStore | undefined;

export function setNativeContentStoreForTests(store?: NativeContentStore): void {
	override = store;
	if (!store) testStore = undefined;
}

export function getNativeContentStore(): NativeContentStore {
	if (override) return override;
	if (process.env.VITEST || process.env.NODE_ENV === 'test') {
		testStore ??= createMemoryNativeContentStore();
		return testStore;
	}
	return createSupabaseNativeContentStore();
}
