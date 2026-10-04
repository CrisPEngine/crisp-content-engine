import { getSupabaseService } from '@/lib/supabaseService';
import type { ArticleRecord } from '@/lib/articles/types';
import type { AssetLink, ContentAssetRecord } from './types';
import type { NativeContentStore } from './store';

function db() {
	return getSupabaseService();
}

function assetFromRow(row: Record<string, unknown>): ContentAssetRecord {
	return {
		id: String(row.id),
		ownerUserId: String(row.owner_user_id),
		brandId: (row.brand_id as string | null) ?? undefined,
		assetType: row.asset_type as ContentAssetRecord['assetType'],
		sourceType: row.source_type as ContentAssetRecord['sourceType'],
		storageProvider: 'cloudinary',
		providerAssetId: (row.provider_asset_id as string | null) ?? undefined,
		url: (row.secure_url as string | null) ?? undefined,
		mimeType: (row.mime_type as string | null) ?? undefined,
		width: (row.width as number | null) ?? undefined,
		height: (row.height as number | null) ?? undefined,
		aspectRatio: (row.aspect_ratio as string | null) ?? undefined,
		fileSize: (row.file_size as number | null) ?? undefined,
		altText: (row.alt_text as string | null) ?? undefined,
		caption: (row.caption as string | null) ?? undefined,
		title: (row.title as string | null) ?? undefined,
		generationPrompt: (row.generation_prompt as string | null) ?? undefined,
		generationProvider: (row.generation_provider as string | null) ?? undefined,
		generationModel: (row.generation_model as string | null) ?? undefined,
		provenance: (row.provenance as Record<string, unknown>) ?? {},
		rightsNotes: (row.rights_notes as string | null) ?? undefined,
		approvalStatus: row.approval_status as ContentAssetRecord['approvalStatus'],
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at),
	};
}

export function createSupabaseNativeContentStore(): NativeContentStore {
	return {
		async saveAsset(asset) {
			const { error } = await db().from('content_assets').upsert({
				id: asset.id,
				owner_user_id: asset.ownerUserId,
				brand_id: asset.brandId ?? null,
				asset_type: asset.assetType,
				source_type: asset.sourceType,
				storage_provider: asset.storageProvider,
				provider_asset_id: asset.providerAssetId ?? null,
				secure_url: asset.url ?? null,
				mime_type: asset.mimeType ?? null,
				width: asset.width ?? null,
				height: asset.height ?? null,
				aspect_ratio: asset.aspectRatio ?? null,
				file_size: asset.fileSize ?? null,
				alt_text: asset.altText ?? null,
				caption: asset.caption ?? null,
				title: asset.title ?? null,
				generation_prompt: asset.generationPrompt ?? null,
				generation_provider: asset.generationProvider ?? null,
				generation_model: asset.generationModel ?? null,
				provenance: asset.provenance,
				rights_notes: asset.rightsNotes ?? null,
				approval_status: asset.approvalStatus,
				created_at: asset.createdAt,
				updated_at: asset.updatedAt,
			});
			if (error) throw new Error(error.message);
			return asset;
		},
		async getAsset(ownerUserId, id) {
			const { data, error } = await db().from('content_assets').select('*').eq('owner_user_id', ownerUserId).eq('id', id).maybeSingle();
			if (error) throw new Error(error.message);
			return data ? assetFromRow(data as Record<string, unknown>) : null;
		},
		async listAssets(ownerUserId, brandId) {
			let query = db().from('content_assets').select('*').eq('owner_user_id', ownerUserId);
			if (brandId) query = query.eq('brand_id', brandId);
			const { data, error } = await query;
			if (error) throw new Error(error.message);
			return (data ?? []).map((row) => assetFromRow(row as Record<string, unknown>));
		},
		async saveLink(link) {
			const { error } = await db().from('content_asset_links').upsert({
				id: link.id,
				owner_user_id: link.ownerUserId,
				asset_id: link.assetId,
				target_type: link.targetType,
				target_id: link.targetId,
				role: link.role ?? null,
				created_at: link.createdAt,
			});
			if (error) throw new Error(error.message);
			return link;
		},
		async listLinks(ownerUserId, targetType, targetId) {
			const { data, error } = await db()
				.from('content_asset_links')
				.select('*')
				.eq('owner_user_id', ownerUserId)
				.eq('target_type', targetType)
				.eq('target_id', targetId);
			if (error) throw new Error(error.message);
			return (data ?? []).map(linkFromRow);
		},
		async listLinksForAsset(ownerUserId, assetId) {
			const { data, error } = await db().from('content_asset_links').select('*').eq('owner_user_id', ownerUserId).eq('asset_id', assetId);
			if (error) throw new Error(error.message);
			return (data ?? []).map(linkFromRow);
		},
		async removeLink(ownerUserId, assetId, targetType, targetId) {
			const { error } = await db()
				.from('content_asset_links')
				.delete()
				.eq('owner_user_id', ownerUserId)
				.eq('asset_id', assetId)
				.eq('target_type', targetType)
				.eq('target_id', targetId);
			if (error) throw new Error(error.message);
		},
		async saveArticle(article) {
			const { error } = await db().from('articles').upsert({
				id: article.id,
				owner_user_id: article.ownerUserId,
				brand_id: article.brandId,
				status: article.status,
				title: article.title,
				slug: article.slug,
				document: article,
				updated_at: article.updatedAt,
				created_at: article.createdAt,
			});
			if (error) throw new Error(error.message);
			return article;
		},
		async getArticle(ownerUserId, id) {
			const { data, error } = await db().from('articles').select('document').eq('owner_user_id', ownerUserId).eq('id', id).maybeSingle();
			if (error) throw new Error(error.message);
			return (data?.document as ArticleRecord | undefined) ?? null;
		},
	};
}

function linkFromRow(row: Record<string, unknown>): AssetLink {
	return {
		id: String(row.id),
		ownerUserId: String(row.owner_user_id),
		assetId: String(row.asset_id),
		targetType: row.target_type as AssetLink['targetType'],
		targetId: String(row.target_id),
		role: (row.role as string | null) ?? undefined,
		createdAt: String(row.created_at),
	};
}
