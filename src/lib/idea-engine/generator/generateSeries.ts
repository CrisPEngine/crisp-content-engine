import 'server-only';

import { LlmError } from '@/lib/llm';
import { getSupabaseService } from '@/lib/supabaseService';
import { loadRunContextFromDb } from '../data/loadRunContext';
import { IDEA_ENGINE_GENERATION_FAILED_MESSAGE } from '../airtable/contentQueueQuery';
import { IdeaEngineError } from '../errors';
import { applyGeneratedItems, markRunFailed } from '../persistence/applyGeneratedItems';
import type { GeneratedItemInput } from '../types';
import { normalizeGeneratedItem } from '../validation/normalize';
import { buildIdeaEnginePrompt } from './buildPrompt';
import { completeIdeaEngineItemsWithRepair } from './completeWithValidationRepair';
import { computeItemSchedules } from './computeSchedules';
import {
	createTimingMark,
	elapsedMs,
	logBatchTiming,
	logRunTiming,
	type BatchTimingRecord,
} from '../observability/generationTiming';
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
}): Promise<{ items: GeneratedItemInput[]; timing: BatchTimingRecord }> {
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

	const batchStartedAt = createTimingMark();
	const { items: rawItems, timing } = await completeIdeaEngineItemsWithRepair(messages);
	const normalized = rawItems.map(normalizeGeneratedItem);
	const scheduled = computeItemSchedules(normalized, {
		timezone: options.context.timezone,
		postingWindows: options.context.postingWindows,
	});

	const persistenceStartedAt = createTimingMark();
	await applyGeneratedItems({
		runId: options.runId,
		userId: options.context.userId,
		items: scheduled,
		markRunComplete: false,
	});
	const persistenceDurationMs = elapsedMs(persistenceStartedAt);

	const batchTiming: BatchTimingRecord = {
		runId: options.runId,
		channel: options.channel,
		itemCount: options.itemCount,
		seriesPositionStart: options.seriesPositionStart,
		seriesTotalForChannel: options.seriesTotalForChannel,
		openaiDurationMs: timing.openaiDurationMs,
		validationDurationMs: timing.validationDurationMs,
		persistenceDurationMs,
		totalDurationMs: elapsedMs(batchStartedAt),
	};
	logBatchTiming(batchTiming);

	return { items: scheduled, timing: batchTiming };
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

	const runStartedAt = createTimingMark();
	const batchTimings: BatchTimingRecord[] = [];

	try {
		const contextStartedAt = createTimingMark();
		const { context } = await loadRunContextFromDb(runId);
		const contextLoadDurationMs = elapsedMs(contextStartedAt);

		if (context.historyWarning) {
			await admin
				.from('idea_engine_runs')
				.update({ generation_warning: context.historyWarning })
				.eq('id', runId);
		}
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

				const { items, timing } = await generateChannelBatch({
					context,
					channel,
					itemCount: batch.count,
					seriesPositionStart: batch.positionStart,
					seriesTotalForChannel: channelTotal,
					runId,
				});
				batchTimings.push(timing);
				allItems.push(...items);
			}
		}

		const finalizeStartedAt = createTimingMark();
		await applyGeneratedItems({
			runId,
			userId: context.userId,
			items: allItems,
			markRunComplete: true,
		});
		const finalizeDurationMs = elapsedMs(finalizeStartedAt);

		logRunTiming({
			runId,
			contextLoadDurationMs,
			totalDurationMs: elapsedMs(runStartedAt),
			batchCount: batchTimings.length,
			itemCount: allItems.length,
			batches: batchTimings,
		});

		console.log('[IdeaEngine] Series complete', {
			runId,
			itemCount: allItems.length,
			channels: channels.join(','),
			finalize_duration_ms: finalizeDurationMs,
			total_duration_ms: elapsedMs(runStartedAt),
		});
	} catch (error) {
		const message =
			error instanceof IdeaEngineError
				? error.message
				: error instanceof LlmError
					? error.message
					: error instanceof Error
						? error.message
						: IDEA_ENGINE_GENERATION_FAILED_MESSAGE;

		console.error('[IdeaEngine] Series failed', { runId, message });
		await markRunFailed(
			runId,
			message === IDEA_ENGINE_GENERATION_FAILED_MESSAGE
				? message
				: `${IDEA_ENGINE_GENERATION_FAILED_MESSAGE} (${message})`,
		);
	}
}
