import 'server-only';

import { getSupabaseService } from '@/lib/supabaseService';

/** DB + API values for generation_stage */
export const IDEA_ENGINE_GENERATION_STAGES = {
	queued: 'queued',
	loadingBrandContext: 'loading_brand_context',
	loadingContentHistory: 'loading_content_history',
	generatingChannel: 'generating_channel',
	openaiRequest: 'openai_request',
	validating: 'validating',
	savingDrafts: 'saving_drafts',
	review: 'review',
	reviewWithErrors: 'review_with_errors',
	failed: 'failed',
} as const;

export type IdeaEngineGenerationStage =
	(typeof IDEA_ENGINE_GENERATION_STAGES)[keyof typeof IDEA_ENGINE_GENERATION_STAGES];

export function channelGenerationStage(channel: string): string {
	return `generating_${channel.toLowerCase().replace(/\s+/g, '_')}`;
}

export async function setRunGenerationStage(
	runId: string,
	stage: string,
	options?: { channel?: string },
): Promise<void> {
	const admin = getSupabaseService();
	const payload: Record<string, unknown> = { generation_stage: stage };
	if (options?.channel) {
		payload.generation_stage = channelGenerationStage(options.channel);
	}
	await admin.from('idea_engine_runs').update(payload).eq('id', runId);
}

export async function markRunGenerationStarted(runId: string): Promise<void> {
	const admin = getSupabaseService();
	await admin
		.from('idea_engine_runs')
		.update({
			generation_stage: IDEA_ENGINE_GENERATION_STAGES.queued,
			generation_started_at: new Date().toISOString(),
		})
		.eq('id', runId);
}

export function generationStageLabel(
	stage: string | null | undefined,
	fallbackChannel?: string,
): string {
	if (!stage) return 'Starting generation…';
	const labels: Record<string, string> = {
		queued: 'Starting generation…',
		loading_brand_context: 'Loading brand context',
		loading_content_history: 'Loading content history',
		openai_request: 'Generating content',
		validating: 'Validating content',
		saving_drafts: 'Saving drafts',
		review: 'Ready for review',
		review_with_errors: 'Ready for review (some errors)',
		failed: 'Failed',
	};
	if (labels[stage]) return labels[stage];
	if (stage.startsWith('generating_')) {
		const ch = stage.replace('generating_', '').replace(/_/g, ' ');
		const pretty =
			ch === 'x'
				? 'X'
				: ch.charAt(0).toUpperCase() + ch.slice(1);
		return `Generating ${pretty} content`;
	}
	if (fallbackChannel) return `Generating ${fallbackChannel} content`;
	return 'Generating content…';
}
