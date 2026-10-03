import { runContentIntelligencePipeline, type IntelligenceAi } from './pipeline';
import type { IntelligenceStore } from './store';
import { buildThemePlan } from './themes';
import type { ContentType, GenerationResult, ThemePlan } from './types';

export type ThemeCampaignResult = {
	plan: ThemePlan;
	pieces: Array<{
		pieceId: string;
		channel: string;
		contentType: string;
		generation: GenerationResult;
	}>;
};

export async function executeThemePlan(input: {
	store: IntelligenceStore;
	userId: string;
	airtableBrandId: string;
	themeId: string;
	coreIdea: string;
	horizonWeeks?: number;
	maxPieces?: number;
	ai?: IntelligenceAi;
}): Promise<ThemeCampaignResult> {
	const theme = await input.store.getTheme(input.userId, input.themeId);
	if (!theme) throw new Error('Theme not found');

	const existing = await input.store.getLatestThemePlan(input.userId, theme.id);
	const plan =
		existing && existing.coreIdea === input.coreIdea
			? existing
			: await input.store.saveThemePlan(input.userId, buildThemePlan(theme, input.coreIdea, input.horizonWeeks ?? 6));

	const limit = input.maxPieces ?? plan.pieces.length;
	const pieces = [];
	let parentMemoryId: string | undefined;

	for (const piece of plan.pieces.slice(0, limit)) {
		const generation = await runContentIntelligencePipeline(
			input.store,
			{
				userId: input.userId,
				airtableBrandId: input.airtableBrandId,
				userIntent: `${input.coreIdea}\n\nChannel adaptation: ${piece.howItAdapts}\nAngle: ${piece.angle}\nHook direction: ${piece.hookDirection}`,
				channel: piece.channel,
				contentType: piece.contentType as ContentType,
				themeId: theme.id,
				optimizationObjective: (theme.objective as never) || 'authority',
				allowThemeContinuation: true,
			},
			input.ai,
		);

		const linked = await input.store.saveMemory(input.userId, {
			...generation.memory,
			parentMemoryId,
			sourceIdea: input.coreIdea,
			metadata: {
				...(generation.memory as { metadata?: Record<string, unknown> }).metadata,
				themePlanId: plan.id,
				themePieceId: piece.id,
				relationshipToCoreIdea: piece.relationshipToCoreIdea,
			},
		});

		if (!parentMemoryId) parentMemoryId = linked.id;
		pieces.push({
			pieceId: piece.id,
			channel: String(piece.channel),
			contentType: String(piece.contentType),
			generation: { ...generation, memory: linked },
		});
	}

	return { plan, pieces };
}
