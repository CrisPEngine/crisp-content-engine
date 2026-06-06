/**
 * Idea Engine quota-aware requested-count computation.
 *
 * Shared between the API run route (server) and the UI preview (client).
 * No server-only imports — safe to import from both environments.
 *
 * Algorithm
 * ---------
 * For each selected channel:
 *   1. Check plan channel access (IDEA_ENGINE_PLAN_CHANNEL_ENABLED).
 *   2. Apply series default (IDEA_ENGINE_SERIES_DEFAULTS).
 *   3. Cap to per-run max (IDEA_ENGINE_RUN_MAX_PER_CHANNEL) and quota remaining.
 *
 * Meta (Instagram / Facebook):
 *   - One platform selected → 1 combined Meta item on that platform.
 *   - Both explicitly selected → 1 each by default, up to per-channel run max.
 *
 * Finally trim to IDEA_ENGINE_RUN_MAX_TOTAL (7).
 */

import {
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
	const desired = IDEA_ENGINE_SERIES_DEFAULTS[chLower] ?? 0;
	const runMax = IDEA_ENGINE_RUN_MAX_PER_CHANNEL[chLower] ?? 0;
	return Math.min(desired, runMax, Math.max(0, quotaRemaining));
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

	const capped = applyRunTotalCap(requestedCounts);
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
