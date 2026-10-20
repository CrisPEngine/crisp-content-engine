import type { AssetSelectionSignal } from './types';

export type AssetLearningBoosts = Map<string, number>;

export function boostsFromSignals(signals: AssetSelectionSignal[]): AssetLearningBoosts {
	const boosts: AssetLearningBoosts = new Map();
	for (const signal of signals) {
		if (!signal.assetId) continue;
		const current = boosts.get(signal.assetId) ?? 0;
		boosts.set(signal.assetId, current + signal.weight);
	}
	return boosts;
}

export function recordSignal(input: Omit<AssetSelectionSignal, 'id' | 'createdAt'> & { id?: string }): AssetSelectionSignal {
	return {
		id: input.id ?? crypto.randomUUID(),
		ownerUserId: input.ownerUserId,
		brandId: input.brandId,
		assetId: input.assetId,
		contentId: input.contentId,
		channel: input.channel,
		signalType: input.signalType,
		weight: input.weight,
		note: input.note,
		createdAt: new Date().toISOString(),
	};
}

/** Default weights for selection learning events. */
export const SIGNAL_WEIGHTS = {
	swap: -2,
	reject: -3,
	performance_boost: 2,
	auto_pick: 0.5,
	manual_attach: 1,
} as const;
