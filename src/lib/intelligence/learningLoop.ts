import 'server-only';

import { analyseEditDiff, nextConfidence } from './editLearning';
import { liveIntelligenceAi } from './pipeline';
import { completeReview } from './review';
import { postProcessPlainDraft } from '@/lib/content/postProcessGeneration';
import { sanitizeSocialPublishFields } from '@/lib/content/socialPublishBody';
import type { IntelligenceStore } from './store';
import type { ContentMemoryRecord } from './types';

export type NativeLearningAction = 'reject' | 'edit' | 'rewrite';

export type CaptureNativeLearningInput = {
	userId: string;
	brandBrainId: string;
	contentId: string;
	channel: string;
	action: NativeLearningAction;
	feedbackText?: string;
	beforeBody?: string;
	afterBody?: string;
	diffSummary?: string;
};

function trimFeedback(value?: string): string {
	return (value ?? '').trim();
}

function summariseDiff(before: string, after: string): string {
	const signals = analyseEditDiff(before, after);
	if (signals.length === 0) return 'No structural diff detected.';
	return signals
		.slice(0, 4)
		.map((signal) => signal.observation)
		.join(' ');
}

async function upsertEditSignals(
	store: IntelligenceStore,
	userId: string,
	brandBrainId: string,
	before: string,
	after: string,
): Promise<void> {
	const signals = analyseEditDiff(before, after);
	if (signals.length === 0) return;
	const existing = await store.listEditLearnings(userId, brandBrainId);
	for (const signal of signals) {
		const match = existing.find((row) => row.signalType === signal.signalType && row.status !== 'rejected' && row.status !== 'disabled');
		const occurrenceCount = (match?.occurrenceCount ?? 0) + 1;
		const confidence = nextConfidence(match?.confidence, occurrenceCount);
		const status = confidence === 'observed' || confidence === 'strong' || confidence === 'confirmed' ? 'accepted' : 'proposed';
		await store.saveEditLearning(userId, {
			id: match?.id,
			brandBrainId,
			signalType: signal.signalType,
			observation: signal.observation,
			confidence,
			status,
			occurrenceCount,
		});
	}
}

export async function captureNativeLearningEvent(
	store: IntelligenceStore,
	input: CaptureNativeLearningInput,
): Promise<{ learningId?: string; diffSummary: string }> {
	const feedback = trimFeedback(input.feedbackText);
	const before = input.beforeBody ?? '';
	const after = input.afterBody ?? '';
	const diffSummary = input.diffSummary ?? (before && after ? summariseDiff(before, after) : feedback || 'No diff captured.');

	if (input.action === 'edit' && before && after && before.trim() !== after.trim()) {
		await upsertEditSignals(store, input.userId, input.brandBrainId, before, after);
	}

	const observationParts = [
		`[${input.action}] ${input.channel} content ${input.contentId}.`,
		feedback ? `User feedback: ${feedback}` : '',
		diffSummary ? `Diff: ${diffSummary}` : '',
	].filter(Boolean);

	const learning = await store.saveLearning(input.userId, {
		brandBrainId: input.brandBrainId,
		scope: input.action === 'reject' ? 'editorial_feedback' : 'editorial',
		channel: input.channel,
		observation: observationParts.join(' '),
		supportingMemoryIds: [input.contentId],
		supportingExperimentIds: [],
		confidence: feedback ? 'low' : 'insufficient',
		validityStatus: 'active',
		createdAt: new Date().toISOString(),
	});

	if (feedback) {
		const existing = await store.listEditLearnings(input.userId, input.brandBrainId);
		const match = existing.find((row) => row.signalType === 'user_feedback' && row.status !== 'rejected');
		const occurrenceCount = (match?.occurrenceCount ?? 0) + 1;
		await store.saveEditLearning(input.userId, {
			id: match?.id,
			brandBrainId: input.brandBrainId,
			signalType: 'user_feedback',
			observation: feedback,
			confidence: nextConfidence(match?.confidence, occurrenceCount),
			status: 'accepted',
			occurrenceCount,
		});
	}

	return { learningId: learning.id, diffSummary };
}

export async function applyNativeRewriteWithFeedback(
	store: IntelligenceStore,
	userId: string,
	memory: ContentMemoryRecord,
	instruction: string,
): Promise<ContentMemoryRecord> {
	const brain = await store.getBrandBrainById(userId, memory.brandBrainId);
	if (!brain) throw new Error('Brand brain not found');

	const beforeBody = memory.body ?? '';
	await store.saveDraft({
		userId,
		brandBrainId: memory.brandBrainId,
		memoryId: memory.id,
		aiVersion: beforeBody,
	});

	const completion = await liveIntelligenceAi.completeJson<{ draft?: string; body?: string }>(
		'WRITING',
		[
			{
				role: 'system',
				content:
					'Revise this brand content using the user feedback. Return JSON with a draft string. Keep brand voice. Do not add claims that are not already implied by the draft or feedback.',
			},
			{
				role: 'user',
				content: `USER FEEDBACK\n${instruction}\n\nCURRENT DRAFT\n${beforeBody}`,
			},
		],
		'native_queue_rewrite',
		userId,
	);

	const revised = completion.data.draft || completion.data.body;
	if (!revised?.trim()) throw new Error('Rewrite did not return content.');

	const review = await completeReview({
		draft: revised,
		brain,
		brief: {
			objective: 'authority',
			audience: brain.identity.audiences?.[0] ?? 'the brand audience',
			channel: memory.channel,
			contentType: memory.contentType ?? 'founder_post',
			funnelStage: 'awareness',
			topic: memory.topic ?? 'untitled',
			angle: memory.angle ?? memory.topic ?? 'untitled',
			hookDirection: memory.hook ?? '',
			centralArgument: memory.argument ?? '',
			supportingPoints: [],
			evidence: [],
			proofPoints: brain.knowledge.proofPoints ?? [],
			relevantBrandContext: [],
			voiceRequirements: [brain.voice.tone].filter((item): item is string => Boolean(item)),
			cta: memory.cta ?? '',
			guardrails: brain.guardrails.phrasesToAvoid ?? [],
			prohibitedPhrases: brain.guardrails.prohibitedClaims ?? [],
			relatedPreviousContent: [],
			differentiationFromRecent: [],
			sourceRequirements: [],
			optimizationObjective: 'authority',
		},
	});

	const finalBodyRaw = postProcessPlainDraft(review.improvedDraft || revised);
	const sanitized = sanitizeSocialPublishFields({
		channel: String(memory.channel),
		body: finalBodyRaw,
		cta: memory.cta,
		metadata: memory.metadata,
	});

	await store.saveDraft({
		userId,
		brandBrainId: memory.brandBrainId,
		memoryId: memory.id,
		aiVersion: finalBodyRaw,
		reviewedVersion: sanitized.body,
		reviewPayload: { rewriteInstruction: instruction },
	});

	const updated = await store.saveMemory(userId, {
		...memory,
		body: sanitized.body,
		...(sanitized.cta != null ? { cta: sanitized.cta } : {}),
		publicationStatus: 'review',
		metadata: sanitized.metadata,
	});

	await captureNativeLearningEvent(store, {
		userId,
		brandBrainId: memory.brandBrainId,
		contentId: memory.id,
		channel: String(memory.channel),
		action: 'rewrite',
		feedbackText: instruction,
		beforeBody: beforeBody,
		afterBody: sanitized.body,
	});

	return updated;
}
