import { z } from 'zod';

const funnelStage = z.enum(['awareness', 'consideration', 'decision', 'retention', 'advocacy']);

export const nativeStrategyPillarSchema = z.object({
	title: z.string().min(1),
	why: z.string().optional(),
	exampleHooks: z.array(z.string()).optional(),
	contentFormats: z.array(z.string()).optional(),
});

export const nativeStrategyProofPointSchema = z.object({
	text: z.string().min(1),
	source: z.enum(['brand_facts', 'research', 'unverified']),
	flagged: z.boolean().optional(),
});

export const nativeStrategyChannelSchema = z.object({
	channel: z.string().min(1),
	role: z.string().optional(),
	cadence: z.string().optional(),
	formats: z.array(z.string()).optional(),
	ctaNotes: z.string().optional(),
	constraints: z.array(z.string()).optional(),
});

export const nativeStrategyCampaignSchema = z.object({
	title: z.string().min(1),
	objective: z.string().optional(),
	description: z.string().optional(),
});

export const nativeStrategyAudienceSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	problems: z.array(z.string()).optional(),
	desiredOutcomes: z.array(z.string()).optional(),
});

export const nativeStrategyExtrasSchema = z.object({
	hashtagBuckets: z.record(z.string(), z.array(z.string())).optional(),
	kpis: z
		.object({
			primary: z.string().optional(),
			secondary: z.string().optional(),
			objectiveAlignment: z.string().optional(),
		})
		.optional(),
	scheduleWindows: z.object({ notes: z.string().optional() }).optional(),
	automationFlags: z.record(z.string(), z.boolean()).optional(),
	voice: z
		.object({
			summary: z.string().optional(),
			dos: z.array(z.string()).optional(),
			donts: z.array(z.string()).optional(),
		})
		.optional(),
	cadenceByPlatform: z.record(z.string(), z.string()).optional(),
	postMix: z
		.object({
			thoughtLeadershipPct: z.number().optional(),
			educationalPct: z.number().optional(),
			promoPct: z.number().optional(),
			communityPct: z.number().optional(),
		})
		.optional(),
	imageDirection: z
		.object({
			styleNotes: z.string().optional(),
			sourcePreference: z.string().optional(),
		})
		.optional(),
	richPillars: z.array(nativeStrategyPillarSchema).optional(),
});

export const nativeStrategyDraftSchema = z.object({
	objectives: z.array(z.string()).default([]),
	audiences: z.array(nativeStrategyAudienceSchema).default([]),
	audienceProblems: z.array(z.string()).default([]),
	desiredOutcomes: z.array(z.string()).default([]),
	positioning: z.string().optional(),
	keyMessages: z.array(z.string()).default([]),
	proofPoints: z.array(nativeStrategyProofPointSchema).default([]),
	contentPillars: z.array(z.string()).default([]),
	funnelStages: z.array(funnelStage).default([]),
	ctaStrategy: z.record(z.string(), z.unknown()).default({}),
	contentMix: z.record(z.string(), z.unknown()).default({}),
	editorialThemes: z.array(z.string()).default([]),
	channelStrategies: z.array(nativeStrategyChannelSchema).default([]),
	campaigns: z.array(nativeStrategyCampaignSchema).default([]),
	extras: nativeStrategyExtrasSchema.default({}),
});

export type NativeStrategyDraft = z.infer<typeof nativeStrategyDraftSchema>;

export function parseNativeStrategyDraft(raw: unknown): NativeStrategyDraft {
	return nativeStrategyDraftSchema.parse(raw);
}

export function safeParseNativeStrategyDraft(raw: unknown): { ok: true; data: NativeStrategyDraft } | { ok: false; error: z.ZodError } {
	const parsed = nativeStrategyDraftSchema.safeParse(raw);
	if (!parsed.success) return { ok: false, error: parsed.error };
	return { ok: true, data: parsed.data };
}
