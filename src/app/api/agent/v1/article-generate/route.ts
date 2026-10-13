import { after, NextResponse } from 'next/server';
import { runArticleGenerationJob } from '@/lib/articles/generationJob';
import { resolveArticleGenerationWorkerSecret } from '@/lib/ai/longFormConfig';
import { getIntelligenceStore } from '@/lib/intelligence/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
	const secret = resolveArticleGenerationWorkerSecret();
	const headerSecret = request.headers.get('x-agent-article-generate-secret');
	if (!secret || headerSecret !== secret) {
		return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	}

	let body: { jobId?: string };
	try {
		body = (await request.json()) as { jobId?: string };
	} catch {
		return NextResponse.json({ ok: false, error: 'JSON body required' }, { status: 400 });
	}
	if (!body.jobId) {
		return NextResponse.json({ ok: false, error: 'jobId is required' }, { status: 400 });
	}

	const store = getIntelligenceStore();
	const jobId = body.jobId;

	after(async () => {
		const job = (await store.claimJobById(jobId)) ?? (await store.getJobById(jobId));
		if (!job) return;
		try {
			const result = await runArticleGenerationJob(job);
			await store.updateJob(job.id, {
				status: 'completed',
				completedAt: new Date().toISOString(),
				payload: { ...job.payload, result },
				lastError: undefined,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Article generation failed';
			await store.updateJob(job.id, {
				status: 'failed',
				completedAt: new Date().toISOString(),
				lastError: message,
			});
		}
	});

	return NextResponse.json({ ok: true, accepted: true, jobId }, { status: 202 });
}
