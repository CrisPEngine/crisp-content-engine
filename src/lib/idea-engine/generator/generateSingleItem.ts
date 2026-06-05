import 'server-only';

import { LlmError } from '@/lib/llm';
import { getSupabaseService } from '@/lib/supabaseService';
import { loadRunContextFromDb } from '../data/loadRunContext';
import { IdeaEngineError } from '../errors';
import { serializeImagePrompt, normalizeGeneratedItem } from '../validation/normalize';
import { buildIdeaEnginePrompt } from './buildPrompt';
import { completeIdeaEngineItemsWithRepair } from './completeWithValidationRepair';
import { computeItemSchedules } from './computeSchedules';

export async function generateSingleItem(itemId: string): Promise<void> {
	const admin = getSupabaseService();

	const { data: item } = await admin
		.from('idea_engine_items')
		.select('id, run_id, user_id, channel, series_position, series_total, status')
		.eq('id', itemId)
		.single();

	if (!item) {
		throw new IdeaEngineError('Item not found', {
			status: 404,
			code: 'idea_engine_item_not_found',
		});
	}

	if (item.status === 'queued') {
		throw new IdeaEngineError('Item already queued', {
			status: 400,
			code: 'idea_engine_item_queued',
		});
	}

	const { context } = await loadRunContextFromDb(item.run_id);

	const messages = buildIdeaEnginePrompt(context, {
		channel: item.channel,
		itemCount: 1,
		seriesRunId: context.seriesRunId,
		seriesPositionStart: item.series_position ?? 1,
		seriesTotalForChannel: item.series_total ?? 1,
	});

	if (!process.env.OPENAI_API_KEY?.trim()) {
		await admin.from('idea_engine_items').update({ status: 'pending' }).eq('id', itemId);
		throw new IdeaEngineError('OPENAI_API_KEY is not configured', {
			status: 503,
			code: 'idea_engine_missing_openai_key',
		});
	}

	try {
		const rawItems = await completeIdeaEngineItemsWithRepair(messages);
		const raw = rawItems[0];
		if (!raw) {
			throw new IdeaEngineError('Regenerated content failed validation', {
				status: 502,
				code: 'idea_engine_schema_validation_failed',
			});
		}

		const normalized = normalizeGeneratedItem({
			...raw,
			series_position: item.series_position ?? raw.series_position,
			series_total: item.series_total ?? raw.series_total,
		});

		const [scheduled] = computeItemSchedules([normalized], {
			timezone: context.timezone,
			postingWindows: context.postingWindows,
		});

		await admin
			.from('idea_engine_items')
			.update({
				post_title: scheduled.post_title || null,
				post_type: scheduled.post_type || null,
				hook: scheduled.hook || scheduled.post_title || null,
				body_draft: scheduled.body_draft || null,
				image_prompt: serializeImagePrompt(scheduled.image_prompt),
				hashtags: scheduled.hashtags || null,
				scheduled_time: scheduled.scheduled_time || null,
				status: 'ready',
				updated_at: new Date().toISOString(),
			})
			.eq('id', itemId);
	} catch (error) {
		const errorMessage =
			error instanceof IdeaEngineError
				? error.message
				: error instanceof LlmError
					? error.message
					: error instanceof Error
						? error.message
						: 'Regeneration failed';

		await admin
			.from('idea_engine_items')
			.update({
				status: 'failed',
				updated_at: new Date().toISOString(),
			})
			.eq('id', itemId);

		if (error instanceof IdeaEngineError) throw error;
		if (error instanceof LlmError) {
			throw new IdeaEngineError(error.message, {
				status: 502,
				code: 'idea_engine_generation_failed',
			});
		}
		throw new IdeaEngineError(errorMessage, {
			status: 502,
			code: 'idea_engine_generation_failed',
		});
	}
}
