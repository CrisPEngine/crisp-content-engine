import { z } from 'zod';
import type { MemoryRetrieval } from './contentMemory';
import type { EditorialPlan } from './plan';
import type { BrandBrain, BrandStrategy, ContentBrief, ContentTheme, OptimizationObjective } from './types';

export const contentBriefSchema = z.object({
	objective: z.string().min(1),
	audience: z.string().min(1),
	channel: z.string().min(1),
	contentType: z.string().min(1),
	funnelStage: z.string().min(1),
	theme: z.string().optional(),
	contentPillar: z.string().optional(),
	campaign: z.string().optional(),
	topic: z.string().min(1),
	angle: z.string().min(1),
	hookDirection: z.string().min(1),
	centralArgument: z.string().min(1),
	supportingPoints: z.array(z.string()).default([]),
	evidence: z.array(z.string()).default([]),
	proofPoints: z.array(z.string()).default([]),
	relevantBrandContext: z.array(z.string()).default([]),
	voiceRequirements: z.array(z.string()).default([]),
	cta: z.string().min(1),
	guardrails: z.array(z.string()).default([]),
	prohibitedPhrases: z.array(z.string()).default([]),
	relatedPreviousContent: z
		.array(z.object({ id: z.string(), reason: z.string(), hook: z.string().optional() }))
		.default([]),
	differentiationFromRecent: z.array(z.string()).default([]),
	sourceRequirements: z.array(z.string()).default([]),
	contentOpportunity: z.string().optional(),
	whyNow: z.string().optional(),
	repetitionRisk: z.string().optional(),
	experimentOpportunity: z.string().optional(),
	optimizationObjective: z.enum([
		'awareness',
		'authority',
		'engagement',
		'website_traffic',
		'lead_generation',
		'conversion',
		'community',
		'retention',
		'launch_awareness',
		'education',
	]),
});

function take<T>(items: T[] | undefined, max: number): T[] {
	return (items ?? []).filter(Boolean).slice(0, max);
}

function pickRelevantKnowledge(brain: BrandBrain, intent: string, topic?: string): string[] {
	const haystacks = [
		...(brain.knowledge.brandFacts ?? []),
		...(brain.knowledge.productFacts ?? []),
		...(brain.knowledge.proofPoints ?? []),
		...(brain.knowledge.differentiators ?? []),
		...(brain.identity.differentiators ?? []),
	];
	const query = `${intent} ${topic ?? ''}`.toLowerCase();
	const scored = haystacks
		.map((fact) => {
			const tokens = fact.toLowerCase().split(/\W+/).filter((token) => token.length > 3);
			const hits = tokens.filter((token) => query.includes(token)).length;
			return { fact, hits };
		})
		.filter((row) => row.hits > 0)
		.sort((a, b) => b.hits - a.hits)
		.map((row) => row.fact);
	return take(scored.length > 0 ? scored : haystacks, 6);
}

export function buildStructuredBrief(input: {
	userIntent: string;
	channel: string;
	contentType?: string;
	objective?: OptimizationObjective;
	brain: BrandBrain;
	strategy?: BrandStrategy | null;
	theme?: ContentTheme | null;
	campaignTitle?: string;
	memory: MemoryRetrieval;
	learnings?: string[];
	plan?: EditorialPlan;
}): ContentBrief {
	const audience =
		input.theme?.targetAudience ||
		input.strategy?.audiences[0]?.name ||
		input.brain.identity.audiences?.[0] ||
		'primary audience';

	const pillar =
		input.theme?.relatedPillars[0] ||
		input.strategy?.contentPillars[0] ||
		undefined;

	const relatedPreviousContent = input.memory.related.slice(0, 5).map((row) => ({
		id: row.id,
		reason: row.themeId && input.theme?.id === row.themeId ? 'same theme, different angle required' : 'topically related',
		hook: row.hook,
	}));

	const voiceRequirements = [
		input.brain.voice.tone,
		input.brain.voice.personality,
		input.brain.voice.formality,
		input.brain.voice.sentenceStyle,
		input.brain.voice.pointOfView,
	].filter((value): value is string => Boolean(value));

	const prohibited = [
		...(input.brain.guardrails.phrasesToAvoid ?? []),
		...(input.brain.guardrails.prohibitedClaims ?? []),
	];

	const plan = input.plan;
	const brief: ContentBrief = {
		objective: plan?.objective || input.theme?.objective || input.strategy?.objectives[0] || 'Serve the standing brand objective',
		audience: plan?.audience || audience,
		channel: input.channel,
		contentType: input.contentType || 'founder_post',
		funnelStage: input.strategy?.funnelStages[0] || 'awareness',
		theme: plan?.selectedTheme || input.theme?.title,
		contentPillar: pillar,
		campaign: input.campaignTitle,
		topic: plan?.topic || input.theme?.subtopics[0] || input.theme?.title || 'The standing brand argument',
		angle: plan?.angle || input.theme?.keyArguments[0] || input.strategy?.keyMessages[0] || 'The brand distinction',
		hookDirection: plan?.hookDirection || (input.memory.warnings.some((warning) => warning.includes('hook'))
			? 'Use a distinct problem-led or evidence-led opening; avoid repeating recent hooks'
			: 'Open on the concrete problem the audience already has'),
		centralArgument: plan?.centralArgument || input.theme?.keyArguments[0] || input.strategy?.keyMessages[0] || 'The brand distinction',
		supportingPoints: take(plan?.supportingConcepts || input.theme?.keyArguments.slice(1) || input.strategy?.keyMessages, 4),
		contentOpportunity: plan?.contentOpportunity,
		whyNow: plan?.whyNow,
		repetitionRisk: plan?.repetitionRisk,
		experimentOpportunity: plan?.experimentOpportunity,
		evidence: pickRelevantKnowledge(input.brain, input.userIntent, input.theme?.title),
		proofPoints: take(input.theme?.proofPoints.length ? input.theme.proofPoints : input.brain.knowledge.proofPoints, 4),
		relevantBrandContext: [
			input.brain.identity.positioning,
			input.brain.identity.purpose,
			...take(input.brain.identity.differentiators, 3),
		].filter((value): value is string => Boolean(value)),
		voiceRequirements,
		cta: plan?.cta || (typeof input.strategy?.ctaStrategy.default === 'string'
			? input.strategy.ctaStrategy.default
			: 'Invite a specific next step appropriate to the channel; respect CTA restrictions'),
		guardrails: [
			...(input.brain.guardrails.styleRestrictions ?? []),
			...(input.brain.guardrails.unwantedAiBehaviours ?? []),
			...(input.brain.guardrails.ctaRestrictions ?? []),
			input.brain.guardrails.promotionalIntensity
				? `Promotional intensity: ${input.brain.guardrails.promotionalIntensity}`
				: '',
			...input.memory.warnings,
			...(input.learnings ?? []),
		].filter(Boolean),
		prohibitedPhrases: prohibited,
		relatedPreviousContent,
		differentiationFromRecent: input.memory.recentSameChannel.slice(0, 4).map((row) => {
			return `Do not reuse hook "${row.hook ?? '(none)'}" or argument "${row.argument ?? '(none)'}"`;
		}),
		sourceRequirements: input.theme?.questionsToAnswer.slice(0, 3) ?? [],
		optimizationObjective: input.objective || 'authority',
	};

	return contentBriefSchema.parse(brief);
}

export function briefToWriterContext(brief: ContentBrief): string {
	return [
		`Objective: ${brief.objective}`,
		`Audience: ${brief.audience}`,
		`Channel: ${brief.channel} / ${brief.contentType}`,
		`Funnel: ${brief.funnelStage}`,
		brief.theme ? `Theme: ${brief.theme}` : null,
		brief.contentPillar ? `Pillar: ${brief.contentPillar}` : null,
		`Topic: ${brief.topic}`,
		'The topic above is the editorial subject. Do not write about the wording of the user instruction.',
		brief.contentOpportunity ? `Opportunity: ${brief.contentOpportunity}` : null,
		brief.whyNow ? `Why now: ${brief.whyNow}` : null,
		`Angle: ${brief.angle}`,
		`Hook direction: ${brief.hookDirection}`,
		`Central argument: ${brief.centralArgument}`,
		brief.repetitionRisk ? `Repetition risk: ${brief.repetitionRisk}` : null,
		brief.experimentOpportunity ? `Experiment: ${brief.experimentOpportunity}` : null,
		`Supporting points: ${brief.supportingPoints.join('; ')}`,
		`Evidence: ${brief.evidence.join('; ')}`,
		`Proof: ${brief.proofPoints.join('; ')}`,
		`Voice: ${brief.voiceRequirements.join('; ')}`,
		`CTA: ${brief.cta}`,
		`Optimise for: ${brief.optimizationObjective} (do not maximise vanity metrics)`,
		`Guardrails: ${brief.guardrails.join('; ')}`,
		brief.prohibitedPhrases.length ? `Never use: ${brief.prohibitedPhrases.join(', ')}` : null,
		brief.differentiationFromRecent.length
			? `Differentiate from recent posts: ${brief.differentiationFromRecent.join('; ')}`
			: null,
	]
		.filter(Boolean)
		.join('\n');
}
