import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { jsonError, requireIntelligenceUser } from '@/lib/intelligence/http';
import {
	dispatchStrategyGenerationWorker,
	enqueueNativeStrategyGeneration,
	publicStrategyGenerationJob,
} from '@/lib/intelligence/strategy/generationJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const postSchema = z.object({
	airtableBrandId: z.string().min(1),
	researchId: z.string().optional(),
	instructions: z.string().optional(),
	escalate: z.boolean().optional(),
});

export async function POST(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const body = postSchema.parse(await request.json());
		const store = getIntelligenceStore();
		const brain = await store.getBrandBrain(userId, body.airtableBrandId);
		if (!brain) {
			return NextResponse.json({ error: 'Activate Brand Brain before generating strategy' }, { status: 400 });
		}

		const job = await enqueueNativeStrategyGeneration({
			ownerUserId: userId,
			airtableBrandId: body.airtableBrandId,
			brandBrainId: brain.id,
			researchId: body.researchId,
			instructions: body.instructions,
			escalate: body.escalate,
			source: 'intelligence_ui',
		});

		await dispatchStrategyGenerationWorker(job.id);

		const refreshed = (await store.getJobById(job.id)) ?? job;
		return NextResponse.json({
			ok: true,
			job: publicStrategyGenerationJob(refreshed),
		});
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}

export async function GET(request: Request) {
	try {
		const { userId } = await requireIntelligenceUser();
		const jobId = new URL(request.url).searchParams.get('jobId');
		if (!jobId) {
			return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
		}
		const store = getIntelligenceStore();
		const job = await store.getJobById(jobId);
		if (!job || job.userId !== userId) {
			return NextResponse.json({ error: 'Job not found' }, { status: 404 });
		}
		return NextResponse.json({ job: publicStrategyGenerationJob(job) });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
