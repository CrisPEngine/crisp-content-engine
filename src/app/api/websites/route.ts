import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { createDestination, DestinationError, listDestinations, listProviders, toView } from '@/lib/destinations/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: unknown) {
	if (error instanceof DestinationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	const message = error instanceof Error ? error.message : 'Request failed';
	return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const brandId = new URL(request.url).searchParams.get('brandId');
		if (!brandId) return NextResponse.json({ destinations: [], providers: listProviders() });
		const destinations = await listDestinations(userId, brandId);
		return NextResponse.json({ destinations: await Promise.all(destinations.map(toView)), providers: listProviders() });
	} catch (error) {
		return fail(error);
	}
}

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = (await request.json()) as Record<string, unknown>;
		const destination = await createDestination(userId, {
			brandId: String(body.brandId ?? ''),
			name: String(body.name ?? ''),
			provider: String(body.provider ?? ''),
			baseUrl: String(body.baseUrl ?? ''),
			apiKey: String(body.apiKey ?? ''),
			bypassToken: typeof body.bypassToken === 'string' ? body.bypassToken : undefined,
		});
		return NextResponse.json({ destination: await toView(destination) });
	} catch (error) {
		return fail(error);
	}
}
