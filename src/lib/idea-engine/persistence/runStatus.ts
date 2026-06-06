import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';
import { logIdeaEngineLifecycle } from '../observability/lifecycle';
import { IDEA_ENGINE_GENERATION_STAGES } from './generationStage';

export type IdeaEngineRunReviewStatus = 'review' | 'review_with_errors' | 'failed';

export async function countRunItemsByStatus(runId: string): Promise<{
	ready: number;
	failed: number;
	generating: number;
	confirmed: number;
}> {
	const admin = getSupabaseService();
	const { data: rows } = await admin
		.from('idea_engine_items')
		.select('status')
		.eq('run_id', runId);

	const counts = { ready: 0, failed: 0, generating: 0, confirmed: 0 };
	for (const row of rows ?? []) {
		const status = row.status as string;
		if (status === 'ready') counts.ready += 1;
		else if (status === 'failed') counts.failed += 1;
		else if (status === 'confirmed' || status === 'queued') counts.confirmed += 1;
		else if (status === 'generating' || status === 'regenerating' || status === 'pending') {
			counts.generating += 1;
		}
	}
	return counts;
}

export function resolveReviewStatusFromCounts(
	counts: { ready: number; failed: number },
	hasChannelErrors: boolean,
): IdeaEngineRunReviewStatus {
	if (counts.ready === 0) return 'failed';
	if (counts.failed > 0 || hasChannelErrors) return 'review_with_errors';
	return 'review';
}

export async function updateRunReviewStatus(options: {
	runId: string;
	hasChannelErrors?: boolean;
	error?: string | null;
	generationWarning?: string | null;
}): Promise<IdeaEngineRunReviewStatus> {
	const admin = getSupabaseService();
	const counts = await countRunItemsByStatus(options.runId);
	const status = resolveReviewStatusFromCounts(
		counts,
		!!options.hasChannelErrors,
	);

	const generationStage =
		status === 'failed'
			? IDEA_ENGINE_GENERATION_STAGES.failed
			: status === 'review_with_errors'
				? IDEA_ENGINE_GENERATION_STAGES.reviewWithErrors
				: IDEA_ENGINE_GENERATION_STAGES.review;

	const payload: Record<string, unknown> = {
		status,
		total_generated: counts.ready + counts.confirmed,
		generation_stage: generationStage,
		updated_at: new Date().toISOString(),
	};
	if (options.error !== undefined) payload.error = options.error;
	if (options.generationWarning !== undefined) {
		payload.generation_warning = options.generationWarning;
	}

	await admin.from('idea_engine_runs').update(payload).eq('id', options.runId);
	logIdeaEngineLifecycle(
		status === 'failed' ? 'run_marked_failed' : 'run_marked_review',
		options.runId,
		{ status, ready: counts.ready, failed: counts.failed },
	);
	return status;
}
