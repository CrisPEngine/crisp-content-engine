import { after, NextResponse } from 'next/server';
import { runArticleGenerationInline } from '@/lib/articles/generationJob';
import { resolveArticleGenerationWorkerSecret } from '@/lib/ai/longFormConfig';

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

	const jobId = body.jobId;

	after(async () => {
		try {
			await runArticleGenerationInline(jobId);
		} catch (error) {
			console.error('[article_generation]', jobId, error);
		}
	});

	return NextResponse.json({ ok: true, accepted: true, jobId }, { status: 202 });
}
