import { NextResponse } from 'next/server';
import { getApiCallStats } from '@/lib/airtable/client';

/**
 * GET /api/admin/airtable-stats
 * Returns API call statistics for tracking reduction
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const endpoint = searchParams.get('endpoint');

		const stats = getApiCallStats(endpoint || undefined);

		return NextResponse.json({
			stats,
			message: endpoint 
				? `Stats for ${endpoint}` 
				: 'Overall stats (use ?endpoint=/api/brands to filter)',
		});
	} catch (error: any) {
		console.error('Error getting Airtable stats:', error);
		return NextResponse.json(
			{ error: error?.message || 'Failed to get stats' },
			{ status: 500 }
		);
	}
}
