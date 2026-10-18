import 'server-only';

import type { IntelligenceStore } from '../store';
import type { BrandStrategy, ChannelStrategy } from '../types';
import type { NativeStrategyDraft } from './nativeStrategySchema';
import type { StrategyGenerationMetadata } from '../types';

export type StrategySnapshotRow = {
	id: string;
	strategyId: string;
	snapshot: Record<string, unknown>;
	reason: string;
	createdAt: string;
};

export function strategyRowToSnapshotPayload(strategy: BrandStrategy): Record<string, unknown> {
	return {
		status: strategy.status,
		objectives: strategy.objectives,
		audiences: strategy.audiences,
		audienceProblems: strategy.audienceProblems,
		desiredOutcomes: strategy.desiredOutcomes,
		positioning: strategy.positioning,
		keyMessages: strategy.keyMessages,
		proofPoints: strategy.proofPoints,
		contentPillars: strategy.contentPillars,
		funnelStages: strategy.funnelStages,
		ctaStrategy: strategy.ctaStrategy,
		contentMix: strategy.contentMix,
		editorialThemes: strategy.editorialThemes,
		strategyExtras: strategy.strategyExtras,
		channelStrategies: strategy.channelStrategies,
		campaigns: strategy.campaigns,
		draftPayload: strategy.draftPayload,
		generationMetadata: strategy.generationMetadata,
	};
}

export function draftToUpsertPatch(draft: NativeStrategyDraft): Omit<BrandStrategy, 'id' | 'userId' | 'brandBrainId' | 'airtableBrandId' | 'campaigns' | 'channelStrategies'> {
	return {
		status: 'active',
		objectives: draft.objectives,
		audiences: draft.audiences.map((a) => ({
			name: a.name,
			description: a.description,
			problems: a.problems,
			desiredOutcomes: a.desiredOutcomes,
		})),
		audienceProblems: draft.audienceProblems,
		desiredOutcomes: draft.desiredOutcomes,
		positioning: draft.positioning,
		keyMessages: draft.keyMessages,
		proofPoints: draft.proofPoints.filter((p) => !p.flagged).map((p) => p.text),
		contentPillars: draft.contentPillars,
		funnelStages: draft.funnelStages,
		ctaStrategy: draft.ctaStrategy,
		contentMix: draft.contentMix,
		editorialThemes: draft.editorialThemes,
		strategyExtras: draft.extras,
		draftPayload: null,
		generationMetadata: { phase: 'idle' },
	};
}

export async function applyDraftChannelStrategies(
	store: IntelligenceStore,
	userId: string,
	strategyId: string,
	draft: NativeStrategyDraft,
	existing: ChannelStrategy[],
): Promise<void> {
	for (const channel of draft.channelStrategies) {
		const match = existing.find((row) => row.channel === channel.channel);
		await store.upsertChannelStrategy(userId, {
			id: match?.id,
			strategyId,
			channel: channel.channel,
			role: channel.role,
			cadence: channel.cadence,
			formats: channel.formats ?? [],
			ctaNotes: channel.ctaNotes,
			constraints: channel.constraints ?? [],
		});
	}
	for (const campaign of draft.campaigns) {
		await store.upsertCampaign(userId, {
			strategyId,
			title: campaign.title,
			objective: campaign.objective,
			description: campaign.description,
			status: 'planned',
		});
	}
}
