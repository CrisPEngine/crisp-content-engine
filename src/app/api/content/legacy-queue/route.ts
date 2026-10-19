import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { listLegacyAirtableQueueForBrand } from '@/lib/content/legacyAirtableQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const brandProfileId = new URL(request.url).searchParams.get('brand_profile_id')?.trim();
		if (!brandProfileId) {
			return NextResponse.json({ error: 'brand_profile_id is required' }, { status: 400 });
		}
		const items = await listLegacyAirtableQueueForBrand({
			userId,
			brandProfileId,
			limit: 30,
		});
		return NextResponse.json({
			items,
			source: 'legacy_airtable',
			note: 'Read-only Make/Airtable drafts. They are not counted in native success metrics. Regenerate natively if you need editable drafts.',
		});
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}
