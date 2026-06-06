import 'server-only';

import { IDEA_ENGINE_GENERATION_FAILED_MESSAGE } from '../airtable/contentQueueQuery';
import { logIdeaEngineLifecycle } from '../observability/lifecycle';
import { markRunFailed } from './applyGeneratedItems';
import { IDEA_ENGINE_GENERATION_STAGES } from './generationStage';
import { getSupabaseService } from '@/lib/supabaseService';

/** Slightly above Vercel's 300s function limit so stale runs are marked failed after platform timeout. */
export const STALE_GENERATING_MS = 6 * 60 * 1000;

type GeneratingRun = {
	id: string;
	status: string;
	created_at: string;
	generation_started_at?: string | null;
};

export function staleRunReferenceTime(run: GeneratingRun): number {
	const ref = run.generation_started_at || run.created_at;
	return new Date(ref).getTime();
}

export function isRunGeneratingStale(run: GeneratingRun, now = Date.now()): boolean {
	if (run.status !== 'generating') return false;
	return now - staleRunReferenceTime(run) >= STALE_GENERATING_MS;
}

export async function markStaleGeneratingRunIfNeeded(
	run: GeneratingRun,
): Promise<string | null> {
	if (!isRunGeneratingStale(run)) return null;

	logIdeaEngineLifecycle('run_marked_failed', run.id, { reason: 'stale_generating' });

	const admin = getSupabaseService();
	await admin
		.from('idea_engine_runs')
		.update({ generation_stage: IDEA_ENGINE_GENERATION_STAGES.failed })
		.eq('id', run.id);

	await markRunFailed(run.id, IDEA_ENGINE_GENERATION_FAILED_MESSAGE);
	return IDEA_ENGINE_GENERATION_FAILED_MESSAGE;
}
