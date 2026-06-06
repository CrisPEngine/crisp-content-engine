import 'server-only';

import {
	IDEA_ENGINE_RUN_MAX_PER_CHANNEL,
	IDEA_ENGINE_RUN_MAX_TOTAL,
	applyRunTotalCap,
	isIdeaEngineChannelEnabledOnPlan,
} from '@/lib/ideaEngineLimits';
import { IDEA_ENGINE_CHANNELS, type IdeaEngineChannel } from '../types';

export const MAX_ITEMS_PER_OPENAI_CALL = 3;

/** Max channels generated in parallel (batches within a channel stay sequential). */
export const CHANNEL_GENERATION_CONCURRENCY = 3;

const SUPPORTED_CHANNEL_SET = new Set<string>(IDEA_ENGINE_CHANNELS);

export function isSupportedChannel(channel: string): channel is IdeaEngineChannel {
	return SUPPORTED_CHANNEL_SET.has(channel);
}

/**
 * Server-side defense: drop unsupported channels, clamp to per-run channel caps and total cap.
 */
export function clampRequestedCountsForGeneration(
	requestedCounts: Record<string, number>,
	planKey: string,
): { counts: Record<string, number>; rejectedChannels: string[] } {
	const rejectedChannels: string[] = [];
	const counts: Record<string, number> = {};

	for (const [channel, rawCount] of Object.entries(requestedCounts)) {
		if (!isSupportedChannel(channel)) {
			rejectedChannels.push(channel);
			continue;
		}

		if (!isIdeaEngineChannelEnabledOnPlan(planKey, channel)) {
			rejectedChannels.push(channel);
			continue;
		}

		const runMax = IDEA_ENGINE_RUN_MAX_PER_CHANNEL[channel.toLowerCase()] ?? 0;
		if (runMax <= 0) {
			rejectedChannels.push(channel);
			continue;
		}

		const count = Math.min(Math.max(0, Math.floor(rawCount)), runMax);
		if (count > 0) {
			counts[channel] = count;
		} else {
			rejectedChannels.push(channel);
		}
	}

	const capped = applyRunTotalCap(counts);
	for (const ch of Object.keys(counts)) {
		if (!(ch in capped)) rejectedChannels.push(ch);
	}

	const total = Object.values(capped).reduce((sum, n) => sum + n, 0);
	if (total > IDEA_ENGINE_RUN_MAX_TOTAL) {
		throw new Error(`Requested ${total} items exceeds run maximum of ${IDEA_ENGINE_RUN_MAX_TOTAL}`);
	}

	return { counts: capped, rejectedChannels };
}

export type ChannelBatch = {
	count: number;
	positionStart: number;
};

/** Split a channel total into OpenAI calls of at most MAX_ITEMS_PER_OPENAI_CALL items. */
export function splitChannelIntoBatches(totalCount: number): ChannelBatch[] {
	if (totalCount <= 0) return [];

	const batches: ChannelBatch[] = [];
	let positionStart = 1;
	let remaining = totalCount;

	while (remaining > 0) {
		const count = Math.min(remaining, MAX_ITEMS_PER_OPENAI_CALL);
		batches.push({ count, positionStart });
		positionStart += count;
		remaining -= count;
	}

	return batches;
}
