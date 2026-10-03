import { deriveRates } from '../performance';
import type { PerformanceSnapshot } from '../types';

export function snapshotFromManualMetrics(input: {
	channel: string;
	memoryId?: string;
	hoursSincePublish?: number;
	impressions?: number;
	reach?: number;
	clicks?: number;
	reactions?: number;
	comments?: number;
	shares?: number;
	saves?: number;
	conversions?: number;
}): Omit<PerformanceSnapshot, 'id'> {
	const rates = deriveRates(input);
	return {
		memoryId: input.memoryId,
		channel: input.channel,
		collectedAt: new Date().toISOString(),
		hoursSincePublish: input.hoursSincePublish,
		impressions: input.impressions,
		reach: input.reach,
		clicks: input.clicks,
		reactions: input.reactions,
		comments: input.comments,
		shares: input.shares,
		saves: input.saves,
		conversions: input.conversions,
		engagementRate: rates.engagementRate,
		clickThroughRate: rates.clickThroughRate,
		normalised: {
			...(rates.engagementRate != null ? { engagementRate: rates.engagementRate } : {}),
			...(rates.clickThroughRate != null ? { clickThroughRate: rates.clickThroughRate } : {}),
		},
	};
}
