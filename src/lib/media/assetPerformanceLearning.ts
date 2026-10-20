import 'server-only';

import { getNativeContentStore } from './store';
import { SIGNAL_WEIGHTS } from './assetLearning';

/** Boost library assets that appeared on posts with strong engagement signals. */
export async function recordPerformanceSignalsForContent(input: {
	ownerUserId: string;
	brandId: string;
	contentId: string;
	channel: string;
	engagementRate?: number;
	impressions?: number;
}): Promise<void> {
	const rate = input.engagementRate ?? 0;
	const impressions = input.impressions ?? 0;
	if (rate < 0.03 && impressions < 500) return;

	const store = getNativeContentStore();
	const links = await store.listLinks(input.ownerUserId, 'content', input.contentId);
	for (const link of links) {
		if (link.selectionPath === 'generated') continue;
		await store.saveSelectionSignal({
			id: crypto.randomUUID(),
			ownerUserId: input.ownerUserId,
			brandId: input.brandId,
			assetId: link.assetId,
			contentId: input.contentId,
			channel: input.channel,
			signalType: 'performance_boost',
			weight: SIGNAL_WEIGHTS.performance_boost,
			note: `Strong engagement on ${input.channel} (rate ${rate.toFixed(3)}, impressions ${impressions}).`,
			createdAt: new Date().toISOString(),
		});
	}
}
