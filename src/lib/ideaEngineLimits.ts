/**
 * Single Idea Engine series defaults and per-run caps.
 * Shared between client preview and server generation (no server-only imports).
 */

/** Default item count per channel when that channel is selected. */
export const IDEA_ENGINE_SERIES_DEFAULTS: Record<string, number> = {
	linkedin: 1,
	x: 3,
	blog: 1,
	instagram: 1,
	facebook: 1,
};

/** Hard per-channel maximum for a single run. */
export const IDEA_ENGINE_RUN_MAX_PER_CHANNEL: Record<string, number> = {
	linkedin: 2,
	x: 4,
	blog: 1,
	instagram: 2,
	facebook: 2,
};

/** Hard maximum total items across all channels in one run. */
export const IDEA_ENGINE_RUN_MAX_TOTAL = 7;

/** Plan → which channels can be selected (not item counts). */
export const IDEA_ENGINE_PLAN_CHANNEL_ENABLED: Record<
	string,
	Partial<Record<'linkedin' | 'x' | 'blog' | 'instagram' | 'facebook', boolean>>
> = {
	starter: {},
	creator: { linkedin: true, x: true, blog: true },
	growth: { linkedin: true, x: true, blog: true, instagram: true, facebook: true },
	pro: { linkedin: true, x: true, blog: true, instagram: true, facebook: true },
	scale: { linkedin: true, x: true, blog: true, instagram: true, facebook: true },
};

const TRIM_ORDER = ['X', 'Facebook', 'Instagram', 'Blog', 'LinkedIn'] as const;

export function isIdeaEngineChannelEnabledOnPlan(
	planKey: string,
	channel: string,
): boolean {
	const key = planKey.toLowerCase();
	const enabled =
		IDEA_ENGINE_PLAN_CHANNEL_ENABLED[key] ?? IDEA_ENGINE_PLAN_CHANNEL_ENABLED.starter;
	const ch = channel.toLowerCase();
	if (ch === 'instagram' || ch === 'facebook') {
		return !!(enabled.instagram || enabled.facebook);
	}
	return !!enabled[ch as keyof typeof enabled];
}

/**
 * When only one Meta platform is selected, allocate a single combined Meta default.
 * When both are explicitly selected, default to 1 each (user can get up to per-channel max).
 */
export function resolveMetaRequestedCounts(options: {
	selectedChannels: string[];
	metaPoolRemaining: number;
}): { counts: Record<string, number>; dropped: string[] } {
	const counts: Record<string, number> = {};
	const dropped: string[] = [];
	const hasInstagram = options.selectedChannels.some((c) => c.toLowerCase() === 'instagram');
	const hasFacebook = options.selectedChannels.some((c) => c.toLowerCase() === 'facebook');

	if (!hasInstagram && !hasFacebook) {
		return { counts, dropped };
	}

	const metaRemaining = Math.max(0, options.metaPoolRemaining);
	const bothExplicit = hasInstagram && hasFacebook;

	if (!bothExplicit) {
		const platform = hasInstagram ? 'Instagram' : 'Facebook';
		const chKey = platform.toLowerCase();
		const desired = IDEA_ENGINE_SERIES_DEFAULTS[chKey] ?? 1;
		const capped = Math.min(
			desired,
			IDEA_ENGINE_RUN_MAX_PER_CHANNEL[chKey] ?? 1,
			metaRemaining,
		);
		if (capped > 0) {
			counts[platform] = capped;
		} else {
			dropped.push(platform);
		}
		return { counts, dropped };
	}

	let metaUsed = 0;
	for (const platform of ['Facebook', 'Instagram'] as const) {
		const chKey = platform.toLowerCase();
		const desired = 1;
		const capped = Math.min(
			desired,
			IDEA_ENGINE_RUN_MAX_PER_CHANNEL[chKey] ?? 1,
			Math.max(0, metaRemaining - metaUsed),
		);
		if (capped > 0) {
			counts[platform] = capped;
			metaUsed += capped;
		} else {
			dropped.push(platform);
		}
	}

	return { counts, dropped };
}

/** Trim counts to IDEA_ENGINE_RUN_MAX_TOTAL without dropping whole channels when possible. */
export function applyRunTotalCap(
	requestedCounts: Record<string, number>,
): Record<string, number> {
	const counts = { ...requestedCounts };
	let total = Object.values(counts).reduce((sum, n) => sum + n, 0);
	if (total <= IDEA_ENGINE_RUN_MAX_TOTAL) return counts;

	for (const channel of TRIM_ORDER) {
		while (total > IDEA_ENGINE_RUN_MAX_TOTAL && (counts[channel] ?? 0) > 0) {
			counts[channel] -= 1;
			total -= 1;
		}
		if (total <= IDEA_ENGINE_RUN_MAX_TOTAL) break;
	}

	for (const [channel, count] of Object.entries(counts)) {
		if (count <= 0) delete counts[channel];
	}

	return counts;
}
