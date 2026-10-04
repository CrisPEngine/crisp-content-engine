import { NextResponse } from 'next/server';
import { requireSessionUserId } from '@/lib/agent/session';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';
import { publicAsset } from '@/lib/media/images';
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

export async function GET(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const brandId = new URL(request.url).searchParams.get('brandId') ?? undefined;
	const brains = await getIntelligenceStore().listBrandBrains(userId);
	if (brandId && !brains.some((brain) => brain.id === brandId)) {
		return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	}
	const assets = await getNativeContentStore().listAssets(userId, brandId);
	return NextResponse.json({
		brands: brains.map((brain) => ({ id: brain.id, name: brain.identity.name })),
		assets: assets.map(publicAsset),
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
	};
	if (!body.assetId || !body.brandId) return NextResponse.json({ error: 'assetId and brandId are required.' }, { status: 400 });
	const brain = await getIntelligenceStore().getBrandBrainById(userId, body.brandId);
	if (!brain) return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	const store = getNativeContentStore();
	const asset = await store.getAsset(userId, body.assetId);
	if (!asset) return NextResponse.json({ error: 'Asset was not found.' }, { status: 404 });
	const libraryType = body.libraryType && LIBRARY_TYPES.has(body.libraryType as LibraryAssetType) ? (body.libraryType as LibraryAssetType) : 'OTHER';
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
		updatedAt: new Date().toISOString(),
	});
	return NextResponse.json({ asset: publicAsset(saved) });
}
