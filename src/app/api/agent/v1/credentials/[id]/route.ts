import { NextResponse } from 'next/server';
import { getAgentStore } from '@/lib/agent/controlStore';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { requireSessionUserId } from '@/lib/agent/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
	const userId = await requireSessionUserId();
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	const { id } = await context.params;
	const body = (await request.json()) as { addBrandId?: string; grantAllBrands?: boolean };
	const store = getAgentStore();
	const credential = await store.getCredential(userId, id);
	if (!credential || credential.revokedAt) {
		return NextResponse.json({ error: 'Credential not found.' }, { status: 404 });
	}

	if (body.grantAllBrands) {
		await store.updateCredential(id, { scope: 'OWNER_ACCOUNT', allowedBrandIds: [] });
		return NextResponse.json({ ok: true, scope: 'OWNER_ACCOUNT', allowedBrandIds: [] });
	}

	const brandId = body.addBrandId?.trim();
	if (!brandId) return NextResponse.json({ error: 'addBrandId or grantAllBrands is required.' }, { status: 400 });
	const brain = await getIntelligenceStore().getBrandBrainById(userId, brandId);
	if (!brain) return NextResponse.json({ error: 'Brand is not on this account.' }, { status: 403 });

	const nextIds = Array.from(new Set([...credential.allowedBrandIds, brain.id]));
	const scope = nextIds.length > 1 ? 'SELECTED_BRANDS' : 'BRAND';
	await store.updateCredential(id, { scope, allowedBrandIds: nextIds });
	return NextResponse.json({ ok: true, scope, allowedBrandIds: nextIds });
}
