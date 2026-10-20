import { NextResponse } from 'next/server';
import { requireSessionUserId } from '@/lib/agent/session';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getNativeContentStore } from '@/lib/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const brandId = new URL(request.url).searchParams.get('brandId');
	if (!brandId) return NextResponse.json({ error: 'brandId is required.' }, { status: 400 });
	const brain = await getIntelligenceStore().getBrandBrainById(userId, brandId);
	if (!brain) return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	const collections = await getNativeContentStore().listCollections(userId, brandId);
	return NextResponse.json({ collections });
}

export async function POST(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const body = (await request.json()) as { brandId?: string; name?: string; parentId?: string };
	if (!body.brandId || !body.name?.trim()) return NextResponse.json({ error: 'brandId and name are required.' }, { status: 400 });
	const brain = await getIntelligenceStore().getBrandBrainById(userId, body.brandId);
	if (!brain) return NextResponse.json({ error: 'That brand is not on this account.' }, { status: 403 });
	const now = new Date().toISOString();
	const collection = await getNativeContentStore().saveCollection({
		id: crypto.randomUUID(),
		ownerUserId: userId,
		brandId: brain.id,
		name: body.name.trim(),
		parentId: body.parentId,
		sortOrder: 0,
		createdAt: now,
		updatedAt: now,
	});
	return NextResponse.json({ collection });
}

export async function DELETE(request: Request) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const id = new URL(request.url).searchParams.get('id');
	if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
	await getNativeContentStore().deleteCollection(userId, id);
	return NextResponse.json({ deleted: true });
}
