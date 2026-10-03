import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const upsertSchema = z.object({
	airtableBrandId: z.string().min(1),
	identity: z.record(z.string(), z.unknown()).optional(),
	voice: z.record(z.string(), z.unknown()).optional(),
	guardrails: z.record(z.string(), z.unknown()).optional(),
	knowledge: z.record(z.string(), z.unknown()).optional(),
	example: z
		.object({
			kind: z.enum(['good', 'poor', 'representative', 'user_edited']),
			channel: z.string().optional(),
			contentType: z.string().optional(),
			body: z.string().min(1),
			whyItWorks: z.string().optional(),
		})
		.optional(),
});

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const airtableBrandId = new URL(request.url).searchParams.get('airtableBrandId');
		if (!airtableBrandId) {
			return NextResponse.json({ error: 'airtableBrandId is required' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, airtableBrandId);
		const strategy = brain ? await store.getStrategyForBrand(userId, brain.id) : null;
		const themes = brain ? await store.listThemes(userId, brain.id) : [];
		return NextResponse.json({ brain, strategy, themes });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}

export async function PUT(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = upsertSchema.parse(await request.json());
		const store = getIntelligenceStore();
		const brain = await store.upsertBrandBrain(userId, body.airtableBrandId, {
			identity: body.identity as never,
			voice: body.voice as never,
			guardrails: body.guardrails as never,
			knowledge: body.knowledge as never,
		});
		if (body.example) {
			await store.addExample(userId, { ...body.example, brandBrainId: brain.id });
		}
		return NextResponse.json({ brain: await store.getBrandBrain(userId, body.airtableBrandId) });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
