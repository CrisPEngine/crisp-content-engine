import 'server-only';

import { LlmError } from '@/lib/llm';
import { getSupabaseService } from '@/lib/supabaseService';
import { loadRunContextFromDb } from '../data/loadRunContext';
import { IDEA_ENGINE_GENERATION_FAILED_MESSAGE } from '../airtable/contentQueueQuery';
import { IdeaEngineError } from '../errors';
import {
	applyGeneratedItems,
	finalizeRunAfterGeneration,
	markChannelItemsFailed,
	markRunFailed,
} from '../persistence/applyGeneratedItems';
import type { GeneratedItemInput } from '../types';
import { normalizeGeneratedItem } from '../validation/normalize';
import { buildIdeaEnginePrompt } from './buildPrompt';
import { completeIdeaEngineItemsWithRepair } from './completeWithValidationRepair';
import { computeItemSchedules } from './computeSchedules';
import {
	CHANNEL_GENERATION_CONCURRENCY,
	clampRequestedCountsForGeneration,
	splitChannelIntoBatches,
} from './generationCaps';
import {
	createTimingMark,
	elapsedMs,
	logBatchTiming,
	logRunTiming,
	type BatchTimingRecord,
} from '../observability/generationTiming';
import { runWithConcurrency } from './runWithConcurrency';

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

async function generateChannelSeries(options: {
	context: Awaited<ReturnType<typeof loadRunContextFromDb>>['context'];
	channel: string;
	channelTotal: number;
	runId: string;
	isCancelled: () => Promise<boolean>;
}): Promise<{ items: GeneratedItemInput[]; timings: BatchTimingRecord[] }> {
	const batches = splitChannelIntoBatches(options.channelTotal);
	const items: GeneratedItemInput[] = [];
	const timings: BatchTimingRecord[] = [];

	for (const batch of batches) {
		if (await options.isCancelled()) {
			break;
		}

		const result = await generateChannelBatch({
			context: options.context,
			channel: options.channel,
			itemCount: batch.count,
			seriesPositionStart: batch.positionStart,
			seriesTotalForChannel: options.channelTotal,
			runId: options.runId,
		});
		items.push(...result.items);
		timings.push(result.timing);
	}

	return { items, timings };
}

export async function generateChannelsForRun(
	runId: string,
	channelsFilter?: string[],
): Promise<void> {
	await runChannelGeneration(runId, channelsFilter);
}

export async function generateSeries(runId: string): Promise<void> {
	await runChannelGeneration(runId);
}

async function runChannelGeneration(
	runId: string,
	channelsFilter?: string[],
): Promise<void> {
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
	let historyWarning: string | null = null;

	const isCancelled = async (): Promise<boolean> => {
		const { data: stillRun } = await admin
			.from('idea_engine_runs')
			.select('status')
			.eq('id', runId)
			.single();
		return stillRun?.status === 'cancelled';
	};

	try {
		const contextStartedAt = createTimingMark();
		const { context } = await loadRunContextFromDb(runId);
		const contextLoadDurationMs = elapsedMs(contextStartedAt);
		historyWarning = context.historyWarning ?? null;

		if (historyWarning) {
			await admin
				.from('idea_engine_runs')
				.update({ generation_warning: historyWarning })
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

		let channels = sortedChannels(requestedCounts);
		if (channelsFilter?.length) {
			const allowed = new Set(channelsFilter);
			channels = channels.filter((ch) => allowed.has(ch));
		}
		if (channels.length === 0) {
			throw new IdeaEngineError('No valid channels to generate', {
				status: 400,
				code: 'idea_engine_no_valid_channels',
			});
		}

		const channelErrors: Array<{ channel: string; message: string }> = [];

		const channelResults = await runWithConcurrency(
			channels.map((channel) => async () => {
				const channelTotal = requestedCounts[channel] ?? 0;
				if (channelTotal <= 0) {
					return { channel, items: [] as GeneratedItemInput[], timings: [] as BatchTimingRecord[] };
				}

				try {
					if (await isCancelled()) {
						return { channel, items: [], timings: [] };
					}

					const result = await generateChannelSeries({
						context,
						channel,
						channelTotal,
						runId,
						isCancelled,
					});
					return { channel, items: result.items, timings: result.timings };
				} catch (error) {
					const message =
						error instanceof IdeaEngineError
							? error.message
							: error instanceof LlmError
								? error.message
								: error instanceof Error
									? error.message
									: IDEA_ENGINE_GENERATION_FAILED_MESSAGE;

					await markChannelItemsFailed(runId, channel, message);
					channelErrors.push({ channel, message });
					return { channel, items: [] as GeneratedItemInput[], timings: [] as BatchTimingRecord[] };
				}
			}),
			CHANNEL_GENERATION_CONCURRENCY,
		);

		const allItems: GeneratedItemInput[] = [];
		for (const result of channelResults) {
			batchTimings.push(...result.timings);
			allItems.push(...result.items);
		}

		const finalizeStartedAt = createTimingMark();
		await finalizeRunAfterGeneration({
			runId,
			userId: context.userId,
			items: allItems,
			channelErrors,
			existingWarning: historyWarning,
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
			channel_errors: channelErrors.map((e) => e.channel),
			parallel_concurrency: CHANNEL_GENERATION_CONCURRENCY,
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
