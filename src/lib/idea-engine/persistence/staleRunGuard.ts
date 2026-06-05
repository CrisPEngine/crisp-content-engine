import 'server-only';

import { IDEA_ENGINE_GENERATION_FAILED_MESSAGE } from '../airtable/contentQueueQuery';
import { markRunFailed } from './applyGeneratedItems';

/** Slightly above Vercel's 300s function limit so stale runs are marked failed after platform timeout. */
const STALE_GENERATING_MS = 6 * 60 * 1000;

type GeneratingRun = {
	id: string;
	status: string;
	created_at: string;
};

export async function markStaleGeneratingRunIfNeeded(
	run: GeneratingRun,
): Promise<string | null> {
	if (run.status !== 'generating') return null;

	const ageMs = Date.now() - new Date(run.created_at).getTime();
	if (ageMs < STALE_GENERATING_MS) return null;

	await markRunFailed(run.id, IDEA_ENGINE_GENERATION_FAILED_MESSAGE);
	return IDEA_ENGINE_GENERATION_FAILED_MESSAGE;
}
