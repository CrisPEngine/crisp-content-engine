import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';
import { backfillBrandNativeStrategy } from '@/lib/intelligence/strategy/brandNativeMigration';
import {
	dispatchStrategyGenerationWorker,
	publicStrategyGenerationJob,
} from '@/lib/intelligence/strategy/generationJob';
import { getIntelligenceStore } from '@/lib/intelligence/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
	airtableBrandId: z.string().min(1),
	escalate: z.boolean().optional(),
	runWebsiteResearch: z.boolean().optional(),
});

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = postSchema.parse(await request.json());
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, body.airtableBrandId);
		if (!brain) {
			return NextResponse.json({ error: 'Activate Brand Brain before regenerating strategy' }, { status: 400 });
		}

		const result = await backfillBrandNativeStrategy({
			ownerUserId: userId,
			airtableBrandId: body.airtableBrandId.trim(),
			escalate: body.escalate ?? true,
			runWebsiteResearch: body.runWebsiteResearch ?? true,
		});

		await dispatchStrategyGenerationWorker(result.jobId).catch((err) => {
			console.error('[regenerate-native] strategy worker dispatch failed:', err);
		});

		const job = await store.getJobById(result.jobId);
		return NextResponse.json({
			ok: true,
			importedSnapshot: result.importedSnapshot,
			job: job ? publicStrategyGenerationJob(job) : { jobId: result.jobId, status: 'pending' },
		});
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
