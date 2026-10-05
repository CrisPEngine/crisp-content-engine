import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { getIntelligenceStore } from '@/lib/intelligence/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const { userId } = await requireIntelligenceUser();
		const brains = await getIntelligenceStore().listBrandBrains(userId);
		return NextResponse.json({
			brands: brains.map((brain) => ({ id: brain.id, name: brain.identity.name, website: brain.identity.description })),
		});
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}
