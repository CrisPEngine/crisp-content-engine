import type { LlmMessage } from '@/lib/llm';
import { completeWithRole } from '@/lib/ai';
import { buildStructuredBrief, briefToWriterContext } from './brief';
import { buildComposableContext } from './context';
import { retrieveRelevantMemory } from './contentMemory';
import { analyseEditDiff, nextConfidence } from './editLearning';
import { applyDecay } from './performance';
import { learningLinesForBrief } from './experimentOps';
import { reviewDraft } from './review';
import { scoreDraft } from './scoring';
import type { IntelligenceStore } from './store';
import type { ContentBrief, GenerationIntent, GenerationResult } from './types';

export type IntelligenceAi = {
	completeJson<T>(role: 'WRITING' | 'REVIEW' | 'STRATEGY', messages: LlmMessage[], feature: string, userId?: string): Promise<T>;
};

export const liveIntelligenceAi: IntelligenceAi = {
	async completeJson(role, messages, feature, userId) {
		const result = await completeWithRole<Record<string, unknown>>(role, {
			messages,
			feature,
			userId,
		});
		return result.data as never;
	},
};

function writerMessages(contextPrompt: string, brief: ContentBrief, userIntent: string): LlmMessage[] {
	return [
		{
			role: 'system',
			content: [
				'You write as this specific brand, not as a generic AI content engine.',
				'Brand voice outranks generic anti-AI style checklists. Do not become formulaically casual.',
				'Return JSON: { "draft": string, "hook": string, "argument": string, "cta": string, "topic": string }',
				'Avoid repeating related previous hooks or arguments unless the brief says theme continuation is allowed.',
			].join('\n'),
		},
		{
			role: 'user',
			content: [
				'## User intent',
				userIntent,
				'',
				'## Structured brief',
				briefToWriterContext(brief),
				'',
				'## Retrieved context (already filtered; do not assume anything omitted is irrelevant forever)',
				contextPrompt,
			].join('\n'),
		},
	];
}

export async function runContentIntelligencePipeline(
	store: IntelligenceStore,
	intent: GenerationIntent,
	ai: IntelligenceAi = liveIntelligenceAi,
): Promise<GenerationResult> {
	const brain = await store.getBrandBrain(intent.userId, intent.airtableBrandId);
	if (!brain) {
		throw new Error('Brand brain not found. Create Brand Brain before native generation.');
	}

	const [strategy, themes, memoryRows, learnings, editLearnings] = await Promise.all([
		store.getStrategyForBrand(intent.userId, brain.id),
		store.listThemes(intent.userId, brain.id),
		store.listMemory(intent.userId, brain.id),
		store.listLearnings(intent.userId, brain.id),
		store.listEditLearnings(intent.userId, brain.id),
	]);

	const theme = intent.themeId
		? themes.find((row) => row.id === intent.themeId) ?? (await store.getTheme(intent.userId, intent.themeId))
		: themes.find((row) => row.status === 'active') ?? null;

	const memory = retrieveRelevantMemory(memoryRows, {
		channel: intent.channel,
		userIntent: intent.userIntent,
		themeId: theme?.id,
		allowThemeContinuation: intent.allowThemeContinuation,
		topic: theme?.title,
	});

	const activeLearnings = applyDecay(learnings).filter(
		(row) => row.validityStatus === 'active' || row.validityStatus === 'decaying',
	);

	const briefPayload = buildStructuredBrief({
		userIntent: intent.userIntent,
		channel: intent.channel,
		contentType: intent.contentType,
		objective: intent.optimizationObjective,
		brain,
		strategy,
		theme,
		campaignTitle: strategy?.campaigns.find((row) => row.id === intent.campaignId)?.title,
		memory,
		learnings: learningLinesForBrief(activeLearnings, intent.channel),
	});

	const storedBrief = await store.saveBrief(intent.userId, {
		brandBrainId: brain.id,
		userIntent: intent.userIntent,
		payload: briefPayload,
		themeId: theme?.id,
		strategyId: strategy?.id,
		campaignId: intent.campaignId,
	});

	const { prompt } = buildComposableContext({
		brain,
		strategy,
		theme,
		memory,
		learnings: activeLearnings,
		editLearnings,
		channel: intent.channel,
	});

	const generated = await ai.completeJson<{ draft?: string; hook?: string; argument?: string; cta?: string; topic?: string }>(
		'WRITING',
		writerMessages(prompt, briefPayload, intent.userIntent),
		'intelligence_draft',
		intent.userId,
	);

	const aiDraft = (generated.draft || '').trim();
	if (!aiDraft) {
		throw new Error('Writing model returned an empty draft');
	}

	let improvedByModel: string | undefined;
	try {
		const reviewed = await ai.completeJson<{ improvedDraft?: string }>(
			'REVIEW',
			[
				{
					role: 'system',
					content:
						'You are an independent editor. Preserve distinctive brand voice. Only fix genuine brand-compliance issues and low-quality AI patterns. Return JSON { "improvedDraft": string }. If the draft is already strong, return it unchanged.',
				},
				{
					role: 'user',
					content: `Brief CTA: ${briefPayload.cta}\nProhibited: ${briefPayload.prohibitedPhrases.join(', ')}\n\nDraft:\n${aiDraft}`,
				},
			],
			'intelligence_review',
			intent.userId,
		);
		improvedByModel = reviewed.improvedDraft;
	} catch {
		improvedByModel = undefined;
	}

	const review = reviewDraft({
		draft: aiDraft,
		brain,
		brief: briefPayload,
		improvedByModel,
	});

	const comparable = memory.recentSameChannel.length;
	const score = scoreDraft({
		draft: review.improvedDraft,
		brief: briefPayload,
		theme,
		memory,
		learnings: activeLearnings,
		brandFit: review.brandFit.score,
		proseScore: review.prose.score,
		comparableCount: comparable,
	});

	const savedMemory = await store.saveMemory(intent.userId, {
		brandBrainId: brain.id,
		themeId: theme?.id,
		campaignId: intent.campaignId,
		strategyId: strategy?.id,
		briefId: storedBrief.id,
		channel: intent.channel,
		contentType: intent.contentType || 'founder_post',
		contentPillar: briefPayload.contentPillar,
		topic: generated.topic || briefPayload.topic,
		angle: briefPayload.angle,
		hook: generated.hook || review.improvedDraft.split('\n')[0],
		argument: generated.argument || briefPayload.centralArgument,
		cta: generated.cta || briefPayload.cta,
		format: intent.contentType,
		body: review.improvedDraft,
		publicationStatus: 'draft',
		sourceIdea: intent.userIntent,
	});

	const draftRow = await store.saveDraft({
		userId: intent.userId,
		brandBrainId: brain.id,
		briefId: storedBrief.id,
		memoryId: savedMemory.id,
		aiVersion: aiDraft,
		reviewedVersion: review.improvedDraft,
		reviewPayload: review,
		scorePayload: score,
	});

	return {
		brief: { ...storedBrief, memoryId: savedMemory.id },
		draftId: draftRow.id,
		aiDraft,
		reviewedDraft: review.improvedDraft,
		review,
		score,
		memory: savedMemory,
		modelRole: 'WRITING',
		requestIds: [],
	};
}

export async function recordUserEdit(
	store: IntelligenceStore,
	userId: string,
	draftId: string,
	userVersion: string,
	brandBrainId: string,
): Promise<void> {
	const versions = await store.updateDraftUserVersion(userId, draftId, userVersion);
	if (!versions) return;
	const signals = analyseEditDiff(versions.aiVersion, versions.userVersion);
	const existing = await store.listEditLearnings(userId, brandBrainId);
	for (const signal of signals) {
		const match = existing.find((row) => row.signalType === signal.signalType && row.status !== 'rejected' && row.status !== 'disabled');
		if (match) {
			const occurrenceCount = match.occurrenceCount + 1;
			await store.saveEditLearning(userId, {
				...match,
				occurrenceCount,
				confidence: nextConfidence(match.confidence, occurrenceCount),
				observation: signal.observation,
			});
		} else {
			await store.saveEditLearning(userId, {
				brandBrainId,
				signalType: signal.signalType,
				observation: signal.observation,
				confidence: 'candidate',
				status: 'proposed',
				occurrenceCount: 1,
			});
		}
	}
}
