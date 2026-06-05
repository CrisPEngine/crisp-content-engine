import 'server-only';

import { IDEA_ENGINE_PLAN_DEFAULTS } from '@/config/pricing';
import { IDEA_ENGINE_CHANNELS, type IdeaEngineChannel } from '../types';

export const MAX_ITEMS_PER_OPENAI_CALL = 3;

const SUPPORTED_CHANNEL_SET = new Set<string>(IDEA_ENGINE_CHANNELS);

export function maxTotalItemsForPlan(planKey: string): number {
	const defaults =
		IDEA_ENGINE_PLAN_DEFAULTS[planKey.toLowerCase()] ?? IDEA_ENGINE_PLAN_DEFAULTS.starter;
	return Object.values(defaults).reduce((sum, n) => sum + n, 0);
}

export function isSupportedChannel(channel: string): channel is IdeaEngineChannel {
	return SUPPORTED_CHANNEL_SET.has(channel);
}

/**
 * Server-side defense: drop unsupported channels, clamp counts to plan limits,
 * and enforce max items per OpenAI call at batch time.
 */
export function clampRequestedCountsForGeneration(
	requestedCounts: Record<string, number>,
	planKey: string,
): { counts: Record<string, number>; rejectedChannels: string[] } {
	const rejectedChannels: string[] = [];
	const counts: Record<string, number> = {};
	const planDefaults =
		IDEA_ENGINE_PLAN_DEFAULTS[planKey.toLowerCase()] ?? IDEA_ENGINE_PLAN_DEFAULTS.starter;

	for (const [channel, rawCount] of Object.entries(requestedCounts)) {
		if (!isSupportedChannel(channel)) {
			rejectedChannels.push(channel);
			continue;
		}

		const planMax = planDefaults[channel.toLowerCase()] ?? 0;
		if (planMax <= 0) {
			rejectedChannels.push(channel);
			continue;
		}

		const count = Math.min(Math.max(0, Math.floor(rawCount)), planMax);
		if (count > 0) {
			counts[channel] = count;
		} else {
			rejectedChannels.push(channel);
		}
	}

	return { counts, rejectedChannels };
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
