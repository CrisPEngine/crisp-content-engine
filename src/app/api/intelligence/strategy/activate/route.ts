import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';
import { activateNativeStrategyDraft } from '@/lib/intelligence/strategy/activateNativeStrategy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
	airtableBrandId: z.string().min(1),
});

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = schema.parse(await request.json());
		const result = await activateNativeStrategyDraft({
			userId,
			airtableBrandId: body.airtableBrandId,
		});
		return NextResponse.json(result);
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
