import { NextResponse } from 'next/server';
import { requireSessionUserId } from '@/lib/agent/session';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
import { runAssetVisionAnalysis } from '@/lib/media/runAssetVision';
import { isStaleScreenshot, searchAssetsLocal } from '@/lib/media/assetSelection';
import { rankAssetsForTopic } from '@/lib/media/assetMatching';
import { publicAssetsWithVision } from '@/lib/media/plannerAssets';
import type { LibraryAssetType } from '@/lib/media/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIBRARY_TYPES = new Set<LibraryAssetType>([
	'PRODUCT_SCREENSHOT',
	'PRODUCT_UI',
	'LOGO',
	'BRAND_MARK',
	'BRAND_REFERENCE',
	'PRODUCT_PHOTO',
	'FOUNDER_PHOTO',
	'MARKETING_EXAMPLE',
	'ARTICLE_IMAGE',
	'SOCIAL_IMAGE',
	'OTHER',
]);

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

function aspectRatioLabel(width?: number, height?: number): string | undefined {
	if (!width || !height) return undefined;
	const divisor = gcd(width, height);
	return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export async function GET(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const url = new URL(request.url);
	const brandId = url.searchParams.get('brandId') ?? undefined;
	const query = url.searchParams.get('q') ?? '';
	const libraryType = url.searchParams.get('libraryType') ?? undefined;
	const collectionId = url.searchParams.get('collectionId') ?? undefined;
	const approvalStatus = url.searchParams.get('approvalStatus') ?? undefined;
	const topic = url.searchParams.get('topic') ?? undefined;

	const brains = await getIntelligenceStore().listBrandBrains(userId);
	if (brandId && !brains.some((brain) => brain.id === brandId)) {
		return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	}
	const store = getNativeContentStore();
	const records = await store.listAssets(userId, brandId);
	const { publicAssets, visionByAssetId } = publicAssetsWithVision(records);

	function withStaleFlag(asset: (typeof publicAssets)[number]) {
		const record = records.find((row) => row.id === asset.id);
		return {
			...asset,
			staleScreenshot: record ? isStaleScreenshot(record) : false,
		};
	}

	let assets = publicAssets.map(withStaleFlag);

	if (libraryType) assets = assets.filter((asset) => asset.libraryType === libraryType);
	if (collectionId) assets = assets.filter((asset) => asset.collectionId === collectionId);
	if (approvalStatus) assets = assets.filter((asset) => asset.approvalStatus === approvalStatus);
	if (topic?.trim()) {
		const ranked = rankAssetsForTopic(topic, assets, visionByAssetId);
		assets = ranked.map((row) => withStaleFlag(row.asset));
	} else if (query.trim()) {
		assets = searchAssetsLocal(query, assets, visionByAssetId).map(withStaleFlag);
	}

	const collections = brandId ? await store.listCollections(userId, brandId) : [];

	return NextResponse.json({
		brands: brains.map((brain) => ({ id: brain.id, name: brain.identity.name })),
		collections,
		assets,
	});
}

export async function POST(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json()) as {
		assetId?: string;
		brandId?: string;
		libraryType?: string;
		title?: string;
		description?: string;
		altText?: string;
		productFeature?: string;
		tags?: string[];
		verifiedReference?: boolean;
		referenceAllowed?: boolean;
		userEdited?: boolean;
		runVisionAnalysis?: boolean;
		approvalStatus?: 'draft' | 'approved' | 'rejected';
		collectionId?: string;
		sourceAttribution?: string;
		rightsNotes?: string;
	};
	if (!body.assetId || !body.brandId) return NextResponse.json({ error: 'assetId and brandId are required.' }, { status: 400 });
	const brain = await getIntelligenceStore().getBrandBrainById(userId, body.brandId);
	if (!brain) return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	const store = getNativeContentStore();
	const asset = await store.getAsset(userId, body.assetId);
	if (!asset) return NextResponse.json({ error: 'Asset was not found.' }, { status: 404 });
	const libraryType = body.libraryType && LIBRARY_TYPES.has(body.libraryType as LibraryAssetType) ? (body.libraryType as LibraryAssetType) : 'OTHER';
	const userEdited = body.userEdited === true;
	const saved = await store.saveAsset({
		...asset,
		brandId: brain.id,
		libraryType,
		title: body.title?.trim() || asset.title,
		description: body.description?.trim() || undefined,
		altText: body.altText?.trim() || asset.altText,
		productFeature: body.productFeature?.trim() || undefined,
		tags: Array.isArray(body.tags) ? body.tags.map((tag) => tag.trim()).filter(Boolean) : asset.tags,
		verifiedReference: body.verifiedReference === true,
		referenceAllowed: body.referenceAllowed === true && body.verifiedReference === true,
		approvalStatus: body.approvalStatus ?? 'approved',
		collectionId: body.collectionId ?? asset.collectionId,
		sourceAttribution: body.sourceAttribution?.trim() || asset.sourceAttribution,
		rightsNotes: body.rightsNotes?.trim() || asset.rightsNotes,
		aspectRatio: asset.aspectRatio ?? aspectRatioLabel(asset.width, asset.height),
		visionUserLocked: userEdited ? true : asset.visionUserLocked,
		updatedAt: new Date().toISOString(),
	});
	let finalAsset = saved;
	if (body.runVisionAnalysis !== false) {
		try {
			finalAsset =
				(await runAssetVisionAnalysis({
					ownerUserId: userId,
					assetId: saved.id,
					brandName: brain.identity.name,
				})) ?? saved;
		} catch {
			finalAsset = saved;
		}
	}
	return NextResponse.json({ asset: publicAsset(finalAsset) });
}

export async function PATCH(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json()) as {
		assetId?: string;
		brandId?: string;
		title?: string;
		description?: string;
		altText?: string;
		tags?: string[];
		approvalStatus?: 'draft' | 'approved' | 'rejected';
		collectionId?: string | null;
		sourceAttribution?: string;
		rightsNotes?: string;
		libraryType?: string;
	};
	if (!body.assetId || !body.brandId) return NextResponse.json({ error: 'assetId and brandId are required.' }, { status: 400 });
	const asset = await getNativeContentStore().getAsset(userId, body.assetId);
	if (!asset || asset.brandId !== body.brandId) return NextResponse.json({ error: 'Asset not found for this brand.' }, { status: 404 });
	const libraryType =
		body.libraryType && LIBRARY_TYPES.has(body.libraryType as LibraryAssetType)
			? (body.libraryType as LibraryAssetType)
			: asset.libraryType;
	const saved = await getNativeContentStore().saveAsset({
		...asset,
		title: body.title?.trim() ?? asset.title,
		description: body.description?.trim() ?? asset.description,
		altText: body.altText?.trim() ?? asset.altText,
		tags: body.tags ?? asset.tags,
		approvalStatus: body.approvalStatus ?? asset.approvalStatus,
		collectionId: body.collectionId === null ? undefined : body.collectionId ?? asset.collectionId,
		sourceAttribution: body.sourceAttribution?.trim() ?? asset.sourceAttribution,
		rightsNotes: body.rightsNotes?.trim() ?? asset.rightsNotes,
		libraryType,
		visionUserLocked: true,
		updatedAt: new Date().toISOString(),
	});
	return NextResponse.json({ asset: publicAsset(saved) });
}

export async function DELETE(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const assetId = new URL(request.url).searchParams.get('assetId');
	const brandId = new URL(request.url).searchParams.get('brandId');
	if (!assetId || !brandId) return NextResponse.json({ error: 'assetId and brandId are required.' }, { status: 400 });
	const asset = await getNativeContentStore().getAsset(userId, assetId);
	if (!asset || asset.brandId !== brandId) return NextResponse.json({ error: 'Asset not found for this brand.' }, { status: 404 });
	await getNativeContentStore().deleteAsset(userId, assetId);
	return NextResponse.json({ deleted: true, assetId });
}
