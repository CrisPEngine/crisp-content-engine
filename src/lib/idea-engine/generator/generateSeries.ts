import 'server-only';

import { LlmError } from '@/lib/llm';
import { getSupabaseService } from '@/lib/supabaseService';
import { loadRunContextFromDb } from '../data/loadRunContext';
import { IdeaEngineError } from '../errors';
import { applyGeneratedItems, markRunFailed } from '../persistence/applyGeneratedItems';
import type { GeneratedItemInput } from '../types';
import { normalizeGeneratedItem } from '../validation/normalize';
import { buildIdeaEnginePrompt } from './buildPrompt';
import { completeIdeaEngineItemsWithRepair } from './completeWithValidationRepair';
import { computeItemSchedules } from './computeSchedules';
import {
	clampRequestedCountsForGeneration,
	splitChannelIntoBatches,
} from './generationCaps';

const CHANNEL_ORDER = ['LinkedIn', 'X', 'Blog', 'Facebook', 'Instagram'];

function sortedChannels(requestedCounts: Record<string, number>): string[] {
	return CHANNEL_ORDER.filter((ch) => (requestedCounts[ch] ?? 0) > 0);
}

async function generateChannelBatch(options: {
	context: Awaited<ReturnType<typeof loadRunContextFromDb>>['context'];
	channel: string;
	itemCount: number;
	seriesPositionStart: number;
	seriesTotalForChannel: number;
	runId: string;
}): Promise<GeneratedItemInput[]> {
	const messages = buildIdeaEnginePrompt(options.context, {
		channel: options.channel,
		itemCount: options.itemCount,
		seriesRunId: options.context.seriesRunId,
		seriesPositionStart: options.seriesPositionStart,
		seriesTotalForChannel: options.seriesTotalForChannel,
	});

	if (!process.env.OPENAI_API_KEY?.trim()) {
		throw new IdeaEngineError('OPENAI_API_KEY is not configured', {
			status: 503,
			code: 'idea_engine_missing_openai_key',
		});
	}

	const rawItems = await completeIdeaEngineItemsWithRepair(messages);
	const normalized = rawItems.map(normalizeGeneratedItem);
	const scheduled = computeItemSchedules(normalized, {
		timezone: options.context.timezone,
		postingWindows: options.context.postingWindows,
	});

	await applyGeneratedItems({
		runId: options.runId,
		userId: options.context.userId,
		items: scheduled,
		markRunComplete: false,
	});

	return scheduled;
}

export async function generateSeries(runId: string): Promise<void> {
	const admin = getSupabaseService();

	const { data: runStatus } = await admin
		.from('idea_engine_runs')
		.select('status')
		.eq('id', runId)
		.single();

	if (runStatus?.status === 'cancelled') {
		return;
	}

	try {
		const { context } = await loadRunContextFromDb(runId);
		const { counts: requestedCounts, rejectedChannels } = clampRequestedCountsForGeneration(
			context.requestedCounts,
			context.plan,
		);

		if (rejectedChannels.length > 0) {
			console.warn('[IdeaEngine] Rejected unsupported channels', {
				runId,
				rejectedChannels,
			});
		}

		const channels = sortedChannels(requestedCounts);
		if (channels.length === 0) {
			throw new IdeaEngineError('No valid channels to generate', {
				status: 400,
				code: 'idea_engine_no_valid_channels',
			});
		}

		const allItems: GeneratedItemInput[] = [];

		for (const channel of channels) {
			const channelTotal = requestedCounts[channel] ?? 0;
			if (channelTotal <= 0) continue;

			const batches = splitChannelIntoBatches(channelTotal);

			for (const batch of batches) {
				const { data: stillRun } = await admin
					.from('idea_engine_runs')
					.select('status')
					.eq('id', runId)
					.single();
				if (stillRun?.status === 'cancelled') return;

				const items = await generateChannelBatch({
					context,
					channel,
					itemCount: batch.count,
					seriesPositionStart: batch.positionStart,
					seriesTotalForChannel: channelTotal,
					runId,
				});
				allItems.push(...items);
			}
		}

		await applyGeneratedItems({
			runId,
			userId: context.userId,
			items: allItems,
			markRunComplete: true,
		});

		console.log('[IdeaEngine] Series complete', {
			runId,
			itemCount: allItems.length,
			channels: channels.join(','),
		});
	} catch (error) {
		const message =
			error instanceof IdeaEngineError
				? error.message
				: error instanceof LlmError
					? error.message
					: error instanceof Error
						? error.message
						: 'Generation failed';

		console.error('[IdeaEngine] Series failed', { runId, message });
		await markRunFailed(runId, message);
	}
}
