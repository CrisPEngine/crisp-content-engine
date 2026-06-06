/**
 * POST /api/idea-engine/run/[runId]/execute
 *
 * Dedicated long-running worker for native Idea Engine generation.
 * Invoked via server-to-server fetch from dispatchGenerationJob (not after()).
 */

import { NextResponse } from 'next/server';
import { generateChannelsForRun } from '@/lib/idea-engine';
import {
	resolveIdeaEngineExecuteSecret,
} from '@/lib/idea-engine/dispatchGeneration';
import { logIdeaEngineLifecycle } from '@/lib/idea-engine/observability/lifecycle';
import { markRunFailed } from '@/lib/idea-engine/persistence/applyGeneratedItems';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ExecuteBody = {
	channels?: string[];
};

export async function POST(
	request: Request,
	context: { params: Promise<{ runId: string }> },
) {
	const { runId } = await context.params;
	const secret = resolveIdeaEngineExecuteSecret();
	const headerSecret = request.headers.get('x-idea-engine-execute-secret');

	if (!secret || headerSecret !== secret) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: ExecuteBody = {};
	try {
		body = (await request.json()) as ExecuteBody;
	} catch {
		/* empty body is fine */
	}

	logIdeaEngineLifecycle('execute_route_invoked', runId, {
		channels: body.channels?.join(',') || 'all',
	});

	try {
		await generateChannelsForRun(runId, body.channels);
		return NextResponse.json({ ok: true, run_id: runId });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Generation failed';
		console.error('[IdeaEngine/Execute] Generation failed', { run_id: runId, message });
		await markRunFailed(runId, message).catch(() => {});
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
