import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { inspectWebsiteDestinations } from '@/lib/publishing/websiteDestinations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		await requireIntelligenceUser();
		const destinations = await inspectWebsiteDestinations();
		return NextResponse.json({
			destinations: destinations.map((destination) => ({
				...destination,
				taxonomy: destination.taxonomy
					? {
							categories: destination.taxonomy.categories,
							contentTypes: destination.taxonomy.contentTypes,
							tags: destination.taxonomy.tags,
							tools: destination.taxonomy.tools,
							requiredMetadata: destination.taxonomy.requiredMetadata ?? [],
						}
					: null,
			})),
		});
	} catch {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}
}
