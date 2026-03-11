/**
 * Idea Engine quota-aware requested-count computation.
 *
 * Shared between the API run route (server) and the UI preview (client).
 * No server-only imports — safe to import from both environments.
 *
 * Algorithm
 * ---------
 * For each selected channel:
 *   1. Look up the plan default for that channel.
 *      If 0 → channel is unsupported on this plan; drop it.
 *   2. Cap against quota remaining:
 *      actual = min(planDefault, quotaRemaining)
 *   3. If actual = 0 → quota exhausted; drop the channel.
 *
 * Meta pool (Facebook + Instagram share one pool):
 *   Deterministic allocation rule: Facebook first, then Instagram.
 *   - Facebook gets min(fbDefault, metaPoolRemaining)
 *   - Instagram gets min(igDefault, remaining after Facebook)
 *   This is intentional: deterministic, predictable, documented.
 *
 * Caller should fail the run only if activeChannels.length === 0.
 */

import { IDEA_ENGINE_PLAN_DEFAULTS } from '@/config/pricing';

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

/**
 * Compute quota-aware requested counts for an Idea Engine run.
 *
 * @param selectedChannels - Display-cased channel names e.g. ["LinkedIn", "X"]
 * @param planKey          - Resolved plan string e.g. "creator", "growth", "free"
 * @param quotaRemaining   - Current remaining quota per pool (from usage_posts or /api/content/quota)
 */
export function computeIdeaEngineRequestedCounts(
	selectedChannels: string[],
	planKey: string,
	quotaRemaining: IdeaEngineQuotaRemaining
): ComputedIdeaEngineCounts {
	const key = planKey.toLowerCase();
	// Unknown or 'free' plans fall back to starter (all zeros — Idea Engine locked).
	// The API enforces the plan gate; this just ensures the computation is safe.
	const defaults = IDEA_ENGINE_PLAN_DEFAULTS[key] ?? IDEA_ENGINE_PLAN_DEFAULTS.starter;

	const requestedCounts: Record<string, number> = {};
	const droppedChannels: string[] = [];

	// ── Non-Meta channels ──────────────────────────────────────────
	for (const ch of selectedChannels) {
		const chLower = ch.toLowerCase();
		if (chLower === 'instagram' || chLower === 'facebook') continue;

		const planDefault = defaults[chLower] ?? 0;
		if (planDefault === 0) {
			droppedChannels.push(ch);
			continue;
		}

		let remaining = 0;
		if (chLower === 'linkedin') remaining = Math.max(0, quotaRemaining.linkedin);
		else if (chLower === 'x')   remaining = Math.max(0, quotaRemaining.x);
		else if (chLower === 'blog') remaining = Math.max(0, quotaRemaining.blog);

		const actual = Math.min(planDefault, remaining);
		if (actual > 0) {
			requestedCounts[ch] = actual;
		} else {
			droppedChannels.push(ch);
		}
	}

	// ── Meta pool channels (Facebook first, then Instagram) ───────
	// This is the deterministic allocation rule. Facebook fills first up to its plan
	// default, then Instagram takes whatever quota remains in the shared pool.
	const hasInstagram = selectedChannels.some(c => c.toLowerCase() === 'instagram');
	const hasFacebook  = selectedChannels.some(c => c.toLowerCase() === 'facebook');

	if (hasFacebook || hasInstagram) {
		const metaRemaining = Math.max(0, quotaRemaining.meta_pool);
		const fbDefault = defaults['facebook'] ?? 0;
		const igDefault = defaults['instagram'] ?? 0;
		let metaUsed = 0;

		if (hasFacebook) {
			if (fbDefault === 0) {
				droppedChannels.push('Facebook');
			} else {
				const fbActual = Math.min(fbDefault, metaRemaining);
				if (fbActual > 0) {
					requestedCounts['Facebook'] = fbActual;
					metaUsed += fbActual;
				} else {
					droppedChannels.push('Facebook');
				}
			}
		}

		if (hasInstagram) {
			if (igDefault === 0) {
				droppedChannels.push('Instagram');
			} else {
				const igActual = Math.min(igDefault, Math.max(0, metaRemaining - metaUsed));
				if (igActual > 0) {
					requestedCounts['Instagram'] = igActual;
				} else {
					droppedChannels.push('Instagram');
				}
			}
		}
	}

	const activeChannels = Object.keys(requestedCounts);
	const totalItems = activeChannels.reduce((sum, ch) => sum + requestedCounts[ch], 0);

	return { requestedCounts, droppedChannels, activeChannels, totalItems };
}
