import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getDefaultJobHandlers } from '@/lib/intelligence/jobHandlers';
import { ingestBrandLinkedInAnalytics } from '@/lib/intelligence/ingestion/linkedin';
import { enqueueWorkflowJob, processNextWorkflowJob } from '@/lib/intelligence/jobs';
import { jsonError, requireIntelligenceUserOrCron } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
	userId: z.string().optional(),
	airtableBrandId: z.string().optional(),
	memoryId: z.string().optional(),
	enqueue: z.boolean().optional(),
});

export async function POST(request: Request) {
	try {
		const auth = await requireIntelligenceUserOrCron(request);
		const body = bodySchema.parse(await request.json().catch(() => ({})));
		const userId = auth.via === 'session' ? auth.userId : body.userId;
		const store = getIntelligenceStore();

		let ingest: { ingested: number; warnings: Array<{ id: string; warning: string }> } | undefined;
		if (userId && body.airtableBrandId) {
			const brain = await store.getBrandBrain(userId, body.airtableBrandId);
			if (!brain) {
				return NextResponse.json({ error: 'Brand brain not found' }, { status: 404 });
			}
			if (body.enqueue) {
				await enqueueWorkflowJob(store, userId, {
					jobType: 'analytics_sync',
					brandBrainId: brain.id,
					payload: { airtableBrandId: body.airtableBrandId, memoryId: body.memoryId },
				});
			} else {
				ingest = await ingestBrandLinkedInAnalytics(store, userId, body.airtableBrandId, body.memoryId);
			}
		}

		const processed = [];
		const handlers = getDefaultJobHandlers(store);
		for (let i = 0; i < 5; i += 1) {
			const job = await processNextWorkflowJob(store, { analytics_sync: handlers.analytics_sync });
			if (!job) break;
			processed.push({ id: job.id, type: job.jobType, status: job.status });
		}

		return NextResponse.json({ ok: true, ingest, processed });
	} catch (error) {
		const mapped = jsonError(error);
		return NextResponse.json(mapped.body, { status: mapped.status });
	}
}
