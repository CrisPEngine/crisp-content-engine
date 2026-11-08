import { NextResponse } from 'next/server';
import { requireIntelligenceUser } from '@/lib/intelligence/http';
import { DestinationError, syncDestinationTaxonomy, testDestination, toView, updateDestination } from '@/lib/destinations/service';
import type { DestinationSettings } from '@/lib/destinations/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(error: unknown) {
	if (error instanceof DestinationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	const message = error instanceof Error ? error.message : 'Request failed';
	return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 401 : 400 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const body = (await request.json()) as Record<string, unknown>;
		const destination = await updateDestination(userId, id, {
			name: typeof body.name === 'string' ? body.name : undefined,
			baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
			enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
			apiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey : undefined,
			bypassToken: typeof body.bypassToken === 'string' ? body.bypassToken : undefined,
			settings: body.settings && typeof body.settings === 'object' ? (body.settings as Partial<DestinationSettings>) : undefined,
		});
		return NextResponse.json({ destination: await toView(destination) });
	} catch (error) {
		return fail(error);
	}
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
	try {
		const { userId } = await requireIntelligenceUser();
		const { id } = await context.params;
		const body = (await request.json()) as Record<string, unknown>;
		if (body.action === 'test') return NextResponse.json({ destination: await toView(await testDestination(userId, id)) });
		if (body.action === 'sync_taxonomy') return NextResponse.json({ destination: await toView(await syncDestinationTaxonomy(userId, id)) });
		return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
	} catch (error) {
		return fail(error);
	}
}
