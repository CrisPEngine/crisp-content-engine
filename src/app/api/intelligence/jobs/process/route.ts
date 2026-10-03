import { NextResponse } from 'next/server';
import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { getDefaultJobHandlers } from '@/lib/intelligence/jobHandlers';
import { processNextWorkflowJob } from '@/lib/intelligence/jobs';
import { authorizeCron } from '@/lib/intelligence/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
	if (!authorizeCron(request)) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const store = getIntelligenceStore();
	const handlers = getDefaultJobHandlers(store);
	const processed = [];
	for (let i = 0; i < 10; i += 1) {
		const job = await processNextWorkflowJob(store, handlers);
		if (!job) break;
		processed.push({ id: job.id, type: job.jobType, status: job.status });
	}

	return NextResponse.json({ ok: true, processed });
}
