import type { LlmMessage } from '@/lib/llm';
import { completeWithRole } from '@/lib/ai';
import { estimateModelCostUsd } from '@/lib/ai/pricing';
import { buildStructuredBrief, briefToWriterContext } from './brief';
import { buildComposableContext } from './context';
import { retrieveRelevantMemory, type MemoryRetrieval } from './contentMemory';
import { analyseEditDiff, nextConfidence } from './editLearning';
import { applyDecay } from './performance';
import { learningLinesForBrief } from './experimentOps';
import { acceptEditorialPlan, buildDeterministicPlan, selectTheme } from './plan';
import { completeReview } from './review';
import { scoreDraft } from './scoring';
import type { IntelligenceStore } from './store';
import type { ContentBrief, ContentTheme, GenerationIntent, GenerationResult, IntelligenceUsage } from './types';
import { CHANNELS } from '@/lib/channels/registry';
import type { ChannelId } from '@/lib/channels/types';
import { validateMemoryChannelConstraints } from '@/lib/channels/validateMemory';

export type IntelligenceCompletion<T> = {
	data: T;
	model?: string;
	promptTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	estimatedCostUsd?: number | null;
};

export type IntelligenceAi = {
	completeJson<T>(
		role: 'FAST' | 'WRITING' | 'REVIEW' | 'STRATEGY',
		messages: LlmMessage[],
		feature: string,
		userId?: string,
	): Promise<IntelligenceCompletion<T>>;
};

export const liveIntelligenceAi: IntelligenceAi = {
	async completeJson(role, messages, feature, userId) {
		const result = await completeWithRole<Record<string, unknown>>(role, {
			messages,
			feature,
			userId,
		});
		return {
			data: result.data as never,
			model: result.model,
			promptTokens: result.rawUsage?.promptTokens,
			completionTokens: result.rawUsage?.completionTokens,
			reasoningTokens: result.rawUsage?.reasoningTokens,
			estimatedCostUsd: estimateModelCostUsd({
				model: result.model,
				inputTokens: result.rawUsage?.promptTokens,
				outputTokens: result.rawUsage?.completionTokens,
			}),
		};
	},
};

function usageFrom(role: string, feature: string, completion: IntelligenceCompletion<unknown>): IntelligenceUsage {
	return {
		role,
		feature,
		model: completion.model,
		promptTokens: completion.promptTokens,
		completionTokens: completion.completionTokens,
		reasoningTokens: completion.reasoningTokens,
		estimatedCostUsd: completion.estimatedCostUsd,
	};
}

function sumCost(calls: IntelligenceUsage[]): number | null {
	const known = calls.map((call) => call.estimatedCostUsd).filter((value): value is number => typeof value === 'number');
	if (known.length === 0) return null;
	return Math.round(known.reduce((sum, value) => sum + value, 0) * 1_000_000) / 1_000_000;
}

function channelDraftLimitLine(channel: string): string | null {
	const channelId = channel.toLowerCase() as ChannelId;
	const max = CHANNELS[channelId]?.constraints.maxCharsPerPost;
	if (!max) return null;
	return `The full draft (including hashtags and line breaks) must be ${max} characters or fewer. Count carefully before returning JSON.`;
}

function writerMessages(contextPrompt: string, brief: ContentBrief, userIntent: string, channel: string): LlmMessage[] {
	const limitLine = channelDraftLimitLine(channel);
	return [
		{
			role: 'system',
			content: [
				'You write as this specific brand, not as a generic AI content engine.',
				'Brand voice outranks generic anti-AI style checklists. Do not become formulaically casual.',
				'Return JSON: { "draft": string, "hook": string, "argument": string, "cta": string, "topic": string }',
				'Avoid repeating related previous hooks or arguments unless the brief says theme continuation is allowed.',
				...(limitLine ? [limitLine] : []),
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

	let theme = selectTheme(themes, memoryRows, intent.themeId);
	if (!theme && intent.themeId) {
		theme = (await store.getTheme(intent.userId, intent.themeId)) ?? null;
	}

	const retrieve = (selected: ContentTheme | null, topic?: string): MemoryRetrieval => retrieveRelevantMemory(memoryRows, {
		channel: intent.channel,
		userIntent: intent.userIntent,
		themeId: selected?.id,
		allowThemeContinuation: intent.allowThemeContinuation,
		topic: topic || selected?.title,
	});
	let memory = retrieve(theme);

	const activeLearnings = applyDecay(learnings).filter(
		(row) => row.validityStatus === 'active' || row.validityStatus === 'decaying',
	);

	const usage: IntelligenceUsage[] = [];
	const fallbackPlan = buildDeterministicPlan({
		userIntent: intent.userIntent,
		brain,
		strategy,
		theme,
		memory,
	});
	let plan = fallbackPlan;
	try {
		const planned = await ai.completeJson<Record<string, unknown>>(
			'FAST',
			[
				{
					role: 'system',
					content: [
						'You select an editorial plan from the supplied brand material.',
						'Return json only.',
						'The topic must be a specific editorial subject. Never return the user instruction as the topic.',
						'Use only the supplied themes, facts, and proof. Do not invent evidence.',
						'Copy supportingConcepts from the supplied list.',
					].join('\n'),
				},
				{
					role: 'user',
					content: JSON.stringify({
						userIntent: intent.userIntent,
						themes: themes.filter((row) => row.status === 'active').map((row) => ({
							title: row.title,
							objective: row.objective,
							arguments: row.keyArguments,
							questions: row.questionsToAnswer,
							subtopics: row.subtopics,
						})),
						recommended: fallbackPlan,
						allowedSupportingConcepts: fallbackPlan.supportingConcepts,
						recent: memory.recentSameChannel.slice(0, 5).map((row) => ({
							hook: row.hook,
							topic: row.topic,
							argument: row.argument,
						})),
					}),
				},
			],
			'intelligence_plan',
			intent.userId,
		);
		usage.push(usageFrom('FAST', 'intelligence_plan', planned));
		plan = acceptEditorialPlan(
			planned.data,
			fallbackPlan,
			themes.map((row) => row.title),
			intent.userIntent,
			intent.themeId ? theme?.title : undefined,
		);
		if (!intent.themeId && plan.selectedTheme && plan.selectedTheme !== theme?.title) {
			const chosen = themes.find((row) => row.title === plan.selectedTheme) ?? null;
			if (chosen) {
				theme = chosen;
				memory = retrieve(theme, plan.topic);
			}
		}
	} catch {
		plan = fallbackPlan;
	}

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
		plan,
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

	const generatedCompletion = await ai.completeJson<{ draft?: string; hook?: string; argument?: string; cta?: string; topic?: string }>(
		'WRITING',
		writerMessages(prompt, briefPayload, intent.userIntent, intent.channel),
		'intelligence_draft',
		intent.userId,
	);
	usage.push(usageFrom('WRITING', 'intelligence_draft', generatedCompletion));
	const generated = generatedCompletion.data;

	const aiDraft = (generated.draft || '').trim();
	if (!aiDraft) {
		throw new Error('Writing model returned an empty draft');
	}

	let draftForReview = aiDraft;
	const channelConstraint = validateMemoryChannelConstraints({
		channel: intent.channel,
		contentType: intent.contentType || 'founder_post',
		body: draftForReview,
		hook: generated.hook || '',
	});
	if (!channelConstraint.ok) {
		const reason = channelConstraint.errors.map((error) => error.message).join(' ');
		const shortened = await ai.completeJson<{ revisedDraft?: string }>(
			'REVIEW',
			[
				{
					role: 'system',
					content: [
						'Shorten the draft to satisfy the channel limit. Preserve meaning and voice.',
						'Return json: { "revisedDraft": string }',
					].join('\n'),
				},
				{ role: 'user', content: `${reason}\n\nDraft:\n${draftForReview}` },
			],
			'intelligence_channel_limit',
			intent.userId,
		);
		usage.push(usageFrom('REVIEW', 'intelligence_channel_limit', shortened));
		draftForReview = (shortened.data.revisedDraft || draftForReview).trim();
	}

	const review = await completeReview({
		draft: draftForReview,
		brain,
		brief: briefPayload,
		revise: async (current, reason) => {
			const revised = await ai.completeJson<{ revisedDraft?: string }>(
				'REVIEW',
				[
					{
						role: 'system',
						content: [
							'Make the smallest edit that resolves the listed violations.',
							'Preserve sentences that are already good. Do not restyle the piece.',
							'Return json: { "revisedDraft": string }',
						].join('\n'),
					},
					{
						role: 'user',
						content: `Violations: ${reason}\n\nDraft:\n${current}`,
					},
				],
				'intelligence_revision',
				intent.userId,
			);
			usage.push(usageFrom('REVIEW', 'intelligence_revision', revised));
			return revised.data.revisedDraft;
		},
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
		topic: briefPayload.topic,
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

	const contextGaps = [
		!strategy ? 'strategy' : '',
		themes.filter((row) => row.status === 'active').length === 0 ? 'themes' : '',
		memoryRows.length === 0 ? 'content_memory' : '',
		!(brain.knowledge.brandFacts && brain.knowledge.brandFacts.length > 0) ? 'brand_facts' : '',
	].filter(Boolean);

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
		usage,
		estimatedCostUsd: sumCost(usage),
		contextGaps,
		memoriesConsidered: [
			...memory.related.map((row) => ({
				id: row.id,
				hook: row.hook,
				topic: row.topic,
				reason: 'retrieved as related',
			})),
			...memory.recentSameChannel
				.filter((row) => !memory.related.some((related) => related.id === row.id))
				.slice(0, 5)
				.map((row) => ({
					id: row.id,
					hook: row.hook,
					topic: row.topic,
					reason: 'recent on this channel',
				})),
		],
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
