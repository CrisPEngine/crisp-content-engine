import 'server-only';

import type { LlmMessage } from '@/lib/llm';
import { completeWithRole } from '@/lib/ai/complete';
import { getRoleConfig, type ModelRole } from '@/lib/ai/roles';
import type { BrandBrain, BrandStrategy, ContentLearning } from '../types';
import {
	nativeStrategyDraftSchema,
	safeParseNativeStrategyDraft,
	type NativeStrategyDraft,
	nativeStrategyProofPointSchema,
} from './nativeStrategySchema';
import type { ResearchRecord } from '@/lib/agent/types';
import type { z } from 'zod';

type ProofPoint = z.infer<typeof nativeStrategyProofPointSchema>;

export type GenerateNativeStrategyInput = {
	brain: BrandBrain;
	onboardingContext?: Record<string, unknown>;
	existingStrategy?: BrandStrategy | null;
	existingDraft?: NativeStrategyDraft | null;
	research?: ResearchRecord | null;
	learnings?: ContentLearning[];
	instructions?: string;
	escalate?: boolean;
	userId: string;
};

export type GenerateNativeStrategyResult = {
	draft: NativeStrategyDraft;
	modelRole: ModelRole;
	model: string;
};

function collectAllowedProofTexts(brain: BrandBrain, research?: ResearchRecord | null): Set<string> {
	const allowed = new Set<string>();
	for (const fact of brain.knowledge.brandFacts ?? []) {
		const t = fact.trim();
		if (t) allowed.add(t.toLowerCase());
	}
	for (const fact of brain.knowledge.productFacts ?? []) {
		const t = fact.trim();
		if (t) allowed.add(t.toLowerCase());
	}
	for (const fact of brain.knowledge.proofPoints ?? []) {
		const t = fact.trim();
		if (t) allowed.add(t.toLowerCase());
	}
	for (const claim of research?.claims ?? []) {
		const t = claim.text?.trim();
		if (t) allowed.add(t.toLowerCase());
	}
	return allowed;
}

function sanitizeProofPoints(
	points: ProofPoint[],
	allowed: Set<string>,
): NativeStrategyDraft['proofPoints'] {
	return points.map((point) => {
		const normalized = point.text.trim();
		const inFacts = allowed.has(normalized.toLowerCase());
		if (point.source === 'unverified' || (!inFacts && point.source !== 'brand_facts' && point.source !== 'research')) {
			return { text: normalized, source: 'unverified' as const, flagged: true };
		}
		if (!inFacts) {
			return { text: normalized, source: 'unverified' as const, flagged: true };
		}
		return { text: normalized, source: point.source, flagged: false };
	});
}

function buildMessages(input: GenerateNativeStrategyInput): LlmMessage[] {
	const { brain, existingStrategy, research, learnings, instructions, onboardingContext } = input;
	const researchClaims = (research?.claims ?? []).slice(0, 24).map((c) => c.text).filter(Boolean);
	const learningLines = (learnings ?? []).slice(0, 8).map((l) => l.observation).filter(Boolean);

	const system = `You are a senior brand strategist for CRISP Content Engine.
Output ONLY valid JSON matching the requested schema.
Rules:
- Never invent offers, pricing, KPI targets, or proof points not grounded in brand facts or supplied research claims.
- If evidence is missing, leave proofPoints empty or use source "unverified" with flagged true only when you must mention uncertainty (prefer omitting).
- Content pillars must include a short "why" and 2-3 example hooks in extras.richPillars; also list pillar titles in contentPillars.
- Populate hashtagBuckets, postMix percentages, scheduleWindows, channelStrategies, and kpis when you have enough context; otherwise use empty objects.
- Respect brand guardrails and voice.`;

	const userPayload = {
		brandIdentity: brain.identity,
		brandVoice: brain.voice,
		brandGuardrails: brain.guardrails,
		brandKnowledge: brain.knowledge,
		onboardingContext: onboardingContext ?? null,
		existingNativeStrategy: existingStrategy
			? {
					objectives: existingStrategy.objectives,
					positioning: existingStrategy.positioning,
					keyMessages: existingStrategy.keyMessages,
					contentPillars: existingStrategy.contentPillars,
				}
			: null,
		researchClaims,
		researchNote: research?.note ?? 'Research claims are not Brand Brain facts until confirmed.',
		learnings: learningLines,
		extraInstructions: instructions ?? null,
		outputSchema: {
			objectives: ['string'],
			audiences: [{ name: 'string', description: 'string?', problems: ['string'], desiredOutcomes: ['string'] }],
			audienceProblems: ['string'],
			desiredOutcomes: ['string'],
			positioning: 'string',
			keyMessages: ['string'],
			proofPoints: [{ text: 'string', source: 'brand_facts|research|unverified', flagged: 'boolean?' }],
			contentPillars: ['string'],
			funnelStages: ['awareness|consideration|decision|retention|advocacy'],
			ctaStrategy: {},
			contentMix: {},
			editorialThemes: ['string'],
			channelStrategies: [{ channel: 'string', role: 'string', cadence: 'string', formats: ['string'] }],
			campaigns: [{ title: 'string', objective: 'string', description: 'string' }],
			extras: {
				hashtagBuckets: {},
				kpis: {},
				scheduleWindows: {},
				automationFlags: {},
				voice: {},
				cadenceByPlatform: {},
				postMix: {},
				imageDirection: {},
				richPillars: [{ title: 'string', why: 'string', exampleHooks: ['string'], contentFormats: ['string'] }],
			},
		},
	};

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: JSON.stringify(userPayload, null, 2) },
	];
}

async function completeStrategyJson(
	role: ModelRole,
	messages: LlmMessage[],
	userId: string,
): Promise<{ data: Record<string, unknown>; model: string }> {
	const result = await completeWithRole<Record<string, unknown>>(role, {
		messages,
		feature: 'native_strategy_generate',
		userId,
		jsonSchemaHint: 'Return a single JSON object for the native brand strategy draft.',
	});
	return { data: result.data, model: result.model };
}

export async function generateNativeStrategy(input: GenerateNativeStrategyInput): Promise<GenerateNativeStrategyResult> {
	const role: ModelRole = input.escalate ? 'DEEP_STRATEGY' : 'STRATEGY';
	const messages = buildMessages(input);
	let lastError: unknown;
	let model = getRoleConfig(role).preferred;

	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const completion = await completeStrategyJson(role, messages, input.userId);
			model = completion.model;
			const parsed = safeParseNativeStrategyDraft(completion.data);
			if (!parsed.ok) {
				messages.push(
					{ role: 'assistant', content: JSON.stringify(completion.data) },
					{
						role: 'user',
						content: `JSON validation failed: ${parsed.error.message}. Fix the JSON to match the schema exactly.`,
					},
				);
				lastError = parsed.error;
				continue;
			}
			const allowed = collectAllowedProofTexts(input.brain, input.research);
			const proofPoints = sanitizeProofPoints(parsed.data.proofPoints, allowed);
			const verifiedOnly = proofPoints.filter((p) => !p.flagged && p.source !== 'unverified');
			const draft = nativeStrategyDraftSchema.parse({
				...parsed.data,
				proofPoints: verifiedOnly,
				contentPillars:
					parsed.data.contentPillars.length > 0
						? parsed.data.contentPillars
						: (parsed.data.extras.richPillars ?? []).map((p) => p.title),
			});
			return { draft, modelRole: role, model };
		} catch (error) {
			lastError = error;
			messages.push({
				role: 'user',
				content: `Generation failed (${error instanceof Error ? error.message : 'unknown'}). Return valid JSON only.`,
			});
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Native strategy generation failed');
}
