import { NextResponse } from 'next/server';
import { requireSessionUserId } from '@/lib/agent/session';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { publicAsset } from '@/lib/media/images';
import { runAssetVisionAnalysis } from '@/lib/media/runAssetVision';
import { assetVisionStatus } from '@/lib/media/assetVision';
import { getNativeContentStore } from '@/lib/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json()) as { assetId?: string; force?: boolean };
	if (!body.assetId) return NextResponse.json({ error: 'assetId is required.' }, { status: 400 });
	const store = getNativeContentStore();
	const existing = await store.getAsset(userId, body.assetId);
	if (!existing) return NextResponse.json({ error: 'Asset was not found.' }, { status: 404 });
	const brandName = existing.brandId
		? (await getIntelligenceStore().getBrandBrainById(userId, existing.brandId))?.identity.name
		: undefined;
	const updated = await runAssetVisionAnalysis({
		ownerUserId: userId,
		assetId: body.assetId,
		brandName,
		force: body.force === true,
	});
	return NextResponse.json({
		asset: updated ? publicAsset(updated) : null,
		vision: assetVisionStatus(),
	});
}
