/**
 * Idea Engine quota-aware requested-count computation.
 *
 * Shared between the API run route (server) and the UI preview (client).
 * No server-only imports — safe to import from both environments.
 *
 * Primary flow: one channel per generate/expand action (IDEA_ENGINE_ACTION_DEFAULTS).
 * Multi-channel helper retained for legacy callers.
 */

import {
	IDEA_ENGINE_ACTION_DEFAULTS,
	IDEA_ENGINE_RUN_MAX_PER_CHANNEL,
	IDEA_ENGINE_SERIES_DEFAULTS,
	applyRunTotalCap,
	isIdeaEngineChannelEnabledOnPlan,
	resolveMetaRequestedCounts,
} from '@/lib/ideaEngineLimits';

export type IdeaEngineQuotaRemaining = {
	linkedin: number;
	x: number;
	blog: number;
	meta_pool: number;
};

export type ComputedIdeaEngineCounts = {
	/** Channels with count > 0 that will be sent to Make. Keys use display casing e.g. "LinkedIn". */
	requestedCounts: Record<string, number>;
	/** Channels that resolved to 0 (unsupported by plan or quota exhausted). */
	droppedChannels: string[];
	/** Channels included in the run (keys of requestedCounts). */
	activeChannels: string[];
	/** Total item count across all active channels. */
	totalItems: number;
};

function capNonMetaChannel(
	channel: string,
	quotaRemaining: number,
): number {
	const chLower = channel.toLowerCase();
	const desired = IDEA_ENGINE_ACTION_DEFAULTS[chLower] ?? IDEA_ENGINE_SERIES_DEFAULTS[chLower] ?? 0;
	const runMax = IDEA_ENGINE_RUN_MAX_PER_CHANNEL[chLower] ?? 0;
	return Math.min(desired, runMax, Math.max(0, quotaRemaining));
}

/**
 * Compute counts for a single channel generate or expand action.
 */
export function computeSingleChannelActionCount(
	channel: string,
	planKey: string,
	quotaRemaining: IdeaEngineQuotaRemaining,
): ComputedIdeaEngineCounts {
	return computeIdeaEngineRequestedCounts([channel], planKey, quotaRemaining);
}

/**
 * Compute quota-aware requested counts for an Idea Engine run.
 */
export function computeIdeaEngineRequestedCounts(
	selectedChannels: string[],
	planKey: string,
	quotaRemaining: IdeaEngineQuotaRemaining,
): ComputedIdeaEngineCounts {
	const requestedCounts: Record<string, number> = {};
	const droppedChannels: string[] = [];

	for (const ch of selectedChannels) {
		const chLower = ch.toLowerCase();
		if (chLower === 'instagram' || chLower === 'facebook') continue;

		if (!isIdeaEngineChannelEnabledOnPlan(planKey, ch)) {
			droppedChannels.push(ch);
			continue;
		}

		let remaining = 0;
		if (chLower === 'linkedin') remaining = Math.max(0, quotaRemaining.linkedin);
		else if (chLower === 'x') remaining = Math.max(0, quotaRemaining.x);
		else if (chLower === 'blog') remaining = Math.max(0, quotaRemaining.blog);

		const actual = capNonMetaChannel(ch, remaining);
		if (actual > 0) {
			requestedCounts[ch] = actual;
		} else {
			droppedChannels.push(ch);
		}
	}

	const meta = resolveMetaRequestedCounts({
		selectedChannels,
		metaPoolRemaining: quotaRemaining.meta_pool,
	});
	for (const [platform, count] of Object.entries(meta.counts)) {
		if (!isIdeaEngineChannelEnabledOnPlan(planKey, platform)) {
			droppedChannels.push(platform);
			continue;
		}
		if (count > 0) requestedCounts[platform] = count;
	}
	droppedChannels.push(...meta.dropped);

	// Single-channel actions (primary flow) skip the legacy multi-channel total cap.
	const capped =
		selectedChannels.length <= 1
			? requestedCounts
			: applyRunTotalCap(requestedCounts);
	for (const ch of Object.keys(requestedCounts)) {
		if (!(ch in capped)) droppedChannels.push(ch);
	}

	const activeChannels = Object.keys(capped);
	const totalItems = activeChannels.reduce((sum, ch) => sum + capped[ch], 0);

	return {
		requestedCounts: capped,
		droppedChannels,
		activeChannels,
		totalItems,
	};
}
