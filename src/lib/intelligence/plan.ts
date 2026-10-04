import type { MemoryRetrieval } from './contentMemory';
import type { BrandBrain, BrandStrategy, ContentTheme } from './types';

export type EditorialPlan = {
	objective: string;
	audience: string;
	selectedTheme?: string;
	topic: string;
	contentOpportunity: string;
	angle: string;
	centralArgument: string;
	whyNow: string;
	supportingConcepts: string[];
	hookDirection: string;
	cta: string;
	repetitionRisk: string;
	experimentOpportunity?: string;
};

function clean(value: unknown): string {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isInstructionTopic(value: string, userIntent: string): boolean {
	const norm = (input: string) => input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
	const topic = norm(value);
	const intent = norm(userIntent);
	if (!topic) return true;
	if (topic === intent) return true;
	return /^(create|write|draft|generate|make)\b/.test(topic);
}

function firstEditorial(candidates: Array<string | undefined>, userIntent: string): string | undefined {
	return candidates.map((item) => clean(item)).find((item) => item && !isInstructionTopic(item, userIntent));
}

export function selectTheme(
	themes: ContentTheme[],
	memory: Array<{ themeId?: string; createdAt: string }>,
	explicitId?: string,
): ContentTheme | null {
	if (explicitId) return themes.find((theme) => theme.id === explicitId) ?? null;
	const active = themes.filter((theme) => theme.status === 'active');
	const pool = active.length > 0 ? active : themes;
	if (pool.length === 0) return null;
	const count = (theme: ContentTheme) => memory.filter((row) => row.themeId === theme.id).length;
	const lastUsed = (theme: ContentTheme) => {
		const stamps = memory.filter((row) => row.themeId === theme.id).map((row) => Date.parse(row.createdAt) || 0);
		return stamps.length ? Math.max(...stamps) : 0;
	};
	return [...pool].sort((a, b) => count(a) - count(b) || lastUsed(a) - lastUsed(b) || a.title.localeCompare(b.title))[0];
}

export function buildDeterministicPlan(input: {
	userIntent: string;
	brain: BrandBrain;
	strategy?: BrandStrategy | null;
	theme?: ContentTheme | null;
	memory: MemoryRetrieval;
}): EditorialPlan {
	const theme = input.theme;
	const topic =
		firstEditorial(
			[theme?.subtopics[0], theme?.questionsToAnswer[0], theme?.keyArguments[0], theme?.description, theme?.title],
			input.userIntent,
		) || 'The product boundary the brand can actually defend';
	const recent = input.memory.recentSameChannel.slice(0, 3);
	const historyEmpty = input.memory.warnings.some((warning) => warning.includes('insufficient history'));
	const noPerformanceHistory = input.memory.recentSameChannel.length < 8;
	return {
		objective: theme?.objective || input.strategy?.objectives[0] || 'Build authority from the brand strategy',
		audience: theme?.targetAudience || input.strategy?.audiences[0]?.name || input.brain.identity.audiences?.[0] || 'primary audience',
		selectedTheme: theme?.title,
		topic,
		contentOpportunity: theme?.description || theme?.objective || 'Make one specific brand argument without a hard sell',
		angle: theme?.keyArguments[0] || input.strategy?.keyMessages[0] || topic,
		centralArgument: theme?.keyArguments[0] || input.strategy?.keyMessages[0] || topic,
		whyNow: input.strategy?.campaigns.find((campaign) => campaign.status === 'active')?.title
			? `Active campaign: ${input.strategy.campaigns.find((campaign) => campaign.status === 'active')?.title}`
			: 'No verified current campaign. The piece is appropriate because this theme still serves the standing authority objective.',
		supportingConcepts: [
			...(theme?.keyArguments.slice(1) ?? []),
			...(input.brain.knowledge.productFacts ?? []),
			...(input.brain.identity.differentiators ?? []),
		].filter(Boolean).slice(0, 4),
		hookDirection: recent.some((row) => row.hook)
			? 'Open on a different tension from the recent hooks listed in memory'
			: 'Open on the concrete problem the audience already has',
		cta: typeof input.strategy?.ctaStrategy.default === 'string'
			? input.strategy.ctaStrategy.default
			: 'Invite a specific next step appropriate to the channel',
		repetitionRisk: recent.length
			? recent.map((row) => `Avoid repeating hook "${row.hook ?? '(none)'}" and argument "${row.argument ?? row.topic ?? '(none)'}"`).join(' ')
			: 'No previous channel posts to collide with',
		experimentOpportunity: historyEmpty || noPerformanceHistory
			? 'Not appropriate yet: insufficient history for performance-informed optimisation'
			: 'Optional later: vary only the opening, and keep the argument stable',
	};
}

export function acceptEditorialPlan(
	raw: unknown,
	fallback: EditorialPlan,
	allowedThemeTitles: string[],
	userIntent: string,
	lockedTheme?: string,
): EditorialPlan {
	const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const proposedTopic = clean(record.topic);
	const topic = proposedTopic && !isInstructionTopic(proposedTopic, userIntent) ? proposedTopic : fallback.topic;
	const proposedTheme = clean(record.selectedTheme);
	const selectedTheme = lockedTheme
		|| (allowedThemeTitles.includes(proposedTheme) ? proposedTheme : fallback.selectedTheme);
	const concepts = Array.isArray(record.supportingConcepts)
		? record.supportingConcepts.map((item) => clean(item)).filter(Boolean).slice(0, 4)
		: [];
	const allowedFacts = new Set(fallback.supportingConcepts.map((item) => item.toLowerCase()));
	const supportingConcepts = concepts.filter((item) => allowedFacts.has(item.toLowerCase()));
	return {
		objective: clean(record.objective) || fallback.objective,
		audience: clean(record.audience) || fallback.audience,
		selectedTheme,
		topic,
		contentOpportunity: clean(record.contentOpportunity) || fallback.contentOpportunity,
		angle: clean(record.angle) || fallback.angle,
		centralArgument: clean(record.centralArgument) || fallback.centralArgument,
		whyNow: clean(record.whyNow) || fallback.whyNow,
		supportingConcepts: supportingConcepts.length ? supportingConcepts : fallback.supportingConcepts,
		hookDirection: clean(record.hookDirection) || fallback.hookDirection,
		cta: clean(record.cta) || fallback.cta,
		repetitionRisk: clean(record.repetitionRisk) || fallback.repetitionRisk,
		experimentOpportunity: clean(record.experimentOpportunity) || fallback.experimentOpportunity,
	};
}
