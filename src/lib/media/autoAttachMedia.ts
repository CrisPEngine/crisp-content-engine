import 'server-only';

import { getIntelligenceStore } from '@/lib/intelligence/actions';
import { generateAssetFromProposal } from './images';
import { planMedia } from './planner';
import { publicAssetsWithVision } from './plannerAssets';
import { pickBestApprovedAsset } from './assetSelection';
import { boostsFromSignals } from './assetLearning';
import { getNativeContentStore } from './store';
import type { RateLimitPolicy } from '@/lib/agent/policy';
import type { MediaDecision, PublicAsset } from './types';

export type AutoAttachAgentContext = {
	credential: {
		id: string;
		ownerUserId: string;
		rateLimit: RateLimitPolicy;
	};
};
import { mediaSpecFor } from './channelMedia';

export type AutoMediaResult = {
	mediaPath: 'library' | 'generated' | 'none';
	mediaPlan: MediaDecision;
	asset?: PublicAsset;
	matchReason?: string;
	generated?: boolean;
};

async function recentUsageContext(ownerUserId: string, brandId: string) {
	const store = getNativeContentStore();
	const intelligence = getIntelligenceStore();
	const memories = await intelligence.listMemoryForBrandBrains(ownerUserId, [brandId]);
	const memoryChannelByContentId = new Map(memories.map((memory) => [memory.id, String(memory.channel)]));
	const assets = await store.listAssets(ownerUserId, brandId);
	const links: Awaited<ReturnType<typeof store.listLinks>> = [];
	for (const asset of assets) {
		links.push(...(await store.listLinksForAsset(ownerUserId, asset.id)));
	}
	return { links, memoryChannelByContentId };
}

export async function resolveMediaForGeneratedContent(input: {
	ctx: AutoAttachAgentContext;
	brandId: string;
	contentId: string;
	channel: string;
	topic: string;
	objective?: string;
	allowGenerate?: boolean;
}): Promise<AutoMediaResult> {
	const store = getNativeContentStore();
	const records = await store.listAssets(input.ctx.credential.ownerUserId, input.brandId);
	const { publicAssets, visionByAssetId } = publicAssetsWithVision(records);
	const { links: recentLinks, memoryChannelByContentId } = await recentUsageContext(
		input.ctx.credential.ownerUserId,
		input.brandId,
	);
	const signals = await store.listSelectionSignals(input.ctx.credential.ownerUserId, input.brandId);
	const learningBoosts = boostsFromSignals(signals);

	const pick = await pickBestApprovedAsset({
		ownerUserId: input.ctx.credential.ownerUserId,
		brandId: input.brandId,
		channel: input.channel,
		topic: input.topic,
		assets: records,
		visionByAssetId,
		recentLinks,
		memoryChannelByContentId,
		learningBoosts,
	});

	const basePlan = planMedia({
		channel: input.channel,
		topic: input.topic,
		objective: input.objective,
		assets: publicAssets,
	});

	if (!basePlan.mediaRecommended && !basePlan.mediaRequired) {
		return { mediaPath: 'none', mediaPlan: basePlan };
	}

	if (pick && !pick.reuseBlocked) {
		await store.saveLink({
			id: crypto.randomUUID(),
			ownerUserId: input.ctx.credential.ownerUserId,
			assetId: pick.asset.id,
			targetType: 'content',
			targetId: input.contentId,
			role: basePlan.mediaRole,
			matchReason: pick.matchReason,
			selectionPath: 'library',
			selectionReason: pick.matchReason,
			createdAt: new Date().toISOString(),
		});
		await store.saveSelectionSignal({
			id: crypto.randomUUID(),
			ownerUserId: input.ctx.credential.ownerUserId,
			brandId: input.brandId,
			assetId: pick.asset.id,
			contentId: input.contentId,
			channel: input.channel,
			signalType: 'auto_pick',
			weight: 0.5,
			note: pick.matchReason,
			createdAt: new Date().toISOString(),
		});

		const memory = await getIntelligenceStore().getMemory(input.ctx.credential.ownerUserId, input.contentId);
		if (memory) {
			await getIntelligenceStore().saveMemory(input.ctx.credential.ownerUserId, {
				...memory,
				metadata: {
					...(memory.metadata ?? {}),
					mediaPath: 'library',
					mediaSelectionReason: pick.matchReason,
					linkedAssetId: pick.asset.id,
				},
			});
		}

		return {
			mediaPath: 'library',
			mediaPlan: {
				...basePlan,
				existingAssetId: pick.asset.id,
				mediaChoice: 'existing',
				preferredSource: 'existing',
				assetMatchReason: pick.matchReason,
				assetMatchScore: pick.score,
			},
			asset: pick.asset,
			matchReason: pick.matchReason,
		};
	}

	if (!input.allowGenerate || !basePlan.mediaRequired && !basePlan.mediaRecommended) {
		return { mediaPath: 'none', mediaPlan: basePlan };
	}

	const spec = mediaSpecFor(input.channel);
	if (spec.implementation === 'NOT_IMPLEMENTED' && !basePlan.mediaRequired) {
		return { mediaPath: 'none', mediaPlan: basePlan };
	}

	try {
		const generated = await generateAssetFromProposal({
			ownerUserId: input.ctx.credential.ownerUserId,
			credentialId: input.ctx.credential.id,
			brandId: input.brandId,
			targetType: 'content',
			targetId: input.contentId,
			decision: basePlan,
			rateLimit: input.ctx.credential.rateLimit,
			channel: input.channel,
			topic: input.topic,
		});
		const links = await store.listLinks(input.ctx.credential.ownerUserId, 'content', input.contentId);
		const last = links.at(-1);
		if (last) {
			await store.saveLink({
				...last,
				selectionPath: 'generated',
				selectionReason: basePlan.reason,
			});
		}

		const memory = await getIntelligenceStore().getMemory(input.ctx.credential.ownerUserId, input.contentId);
		if (memory) {
			await getIntelligenceStore().saveMemory(input.ctx.credential.ownerUserId, {
				...memory,
				metadata: {
					...(memory.metadata ?? {}),
					mediaPath: 'generated',
					mediaSelectionReason: basePlan.reason,
					linkedAssetId: generated.asset.id,
				},
			});
		}

		return {
			mediaPath: 'generated',
			mediaPlan: { ...basePlan, mediaChoice: 'generate', preferredSource: 'generate' },
			asset: generated.asset,
			matchReason: basePlan.reason,
			generated: !generated.reused,
		};
	} catch {
		return { mediaPath: 'none', mediaPlan: basePlan };
	}
}
