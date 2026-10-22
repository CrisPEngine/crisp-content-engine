import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { getPublishHealthReport } from '@/lib/publish/publishHealthReport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		const user = await requireIntelligenceUser();
		const report = await getPublishHealthReport({ userId: user.userId });
		return NextResponse.json(report);
	} catch (error: unknown) {
		const status =
			typeof error === 'object' && error && 'status' in error ? Number((error as { status: number }).status) : 500;
		const message = error instanceof Error ? error.message : 'Failed to load publish health';
		return NextResponse.json({ error: message }, { status: status >= 400 ? status : 500 });
	}
}
