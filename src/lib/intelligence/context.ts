import type { BrandBrain, BrandStrategy, ContentLearning, ContentTheme, UserEditLearning } from './types';
import type { MemoryRetrieval } from './contentMemory';

const MAX_SECTION_CHARS = 1800;

function clip(value: string, max = MAX_SECTION_CHARS): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max)}…`;
}

function lines(items: Array<string | undefined> | undefined, max = 8): string {
	return (items ?? []).filter((item): item is string => Boolean(item)).slice(0, max).map((item) => `- ${item}`).join('\n');
}

export function buildComposableContext(input: {
	brain: BrandBrain;
	strategy?: BrandStrategy | null;
	theme?: ContentTheme | null;
	memory: MemoryRetrieval;
	learnings: ContentLearning[];
	editLearnings?: UserEditLearning[];
	channel: string;
}): { sections: Record<string, string>; prompt: string } {
	const { brain, strategy, theme, memory, learnings, editLearnings, channel } = input;

	const identity = clip(
		[
			brain.identity.name,
			brain.identity.positioning,
			brain.identity.purpose,
			lines(brain.identity.differentiators, 4),
		]
			.filter(Boolean)
			.join('\n'),
	);

	const voice = clip(
		[
			brain.voice.tone,
			brain.voice.personality,
			brain.voice.formality,
			brain.voice.sentenceStyle,
			brain.voice.pointOfView,
			brain.voice.humour,
			brain.voice.pacing,
		]
			.filter(Boolean)
			.join('\n'),
	);

	const guardrails = clip(
		lines([
			...(brain.guardrails.phrasesToAvoid ?? []).map((item) => `Avoid phrase: ${item}`),
			...(brain.guardrails.prohibitedClaims ?? []).map((item) => `Do not claim: ${item}`),
			...(brain.guardrails.termRules ?? []).map((rule) => `${rule.level} term: ${rule.term}`),
			...(brain.guardrails.requiredTerminology ?? []).map((item) => `REQUIRED term: ${item}`),
			...(brain.guardrails.unwantedAiBehaviours ?? []),
			brain.guardrails.promotionalIntensity
				? `Promotional intensity: ${brain.guardrails.promotionalIntensity}`
				: undefined,
		]),
	);

	const examples = clip(
		brain.examples
			.filter((example) => example.kind === 'good' || example.kind === 'representative' || example.kind === 'user_edited')
			.slice(0, 3)
			.map((example) => `(${example.kind} / ${example.channel ?? 'any'}): ${example.body}`)
			.join('\n\n'),
		1200,
	);

	const strategySlice = clip(
		[
			strategy?.positioning,
			strategy ? `Objectives: ${strategy.objectives.slice(0, 3).join('; ')}` : undefined,
			strategy ? `Key messages: ${strategy.keyMessages.slice(0, 4).join('; ')}` : undefined,
			strategy?.channelStrategies
				.find((row) => row.channel === channel)
				? `Channel role: ${strategy.channelStrategies.find((row) => row.channel === channel)?.role}`
				: undefined,
		]
			.filter(Boolean)
			.join('\n'),
		900,
	);

	const themeSlice = theme
		? clip(
				[
					`Theme: ${theme.title}`,
					theme.objective,
					`Arguments: ${theme.keyArguments.slice(0, 4).join('; ')}`,
					`Subtopics: ${theme.subtopics.slice(0, 5).join('; ')}`,
				]
					.filter(Boolean)
					.join('\n'),
				800,
			)
		: '';

	const memorySlice = clip(
		[
			...memory.related.slice(0, 4).map((row) => `Related (${row.channel}): hook="${row.hook ?? ''}" argument="${row.argument ?? ''}"`),
			...memory.warnings,
			memory.continuationAllowed
				? 'Theme continuation is allowed: vary the angle, do not copy the previous piece.'
				: 'Do not continue a previous piece unless it is clearly a sequel.',
		].join('\n'),
		900,
	);

	const applicableLearnings = learnings
		.filter((row) => row.validityStatus === 'active' || row.validityStatus === 'decaying')
		.filter((row) => !row.channel || row.channel === channel)
		.slice(0, 5);

	const learningSlice = clip(
		applicableLearnings
			.map((row) => `[${row.confidence}] ${row.observation}`)
			.join('\n'),
		700,
	);

	const acceptedEdits = (editLearnings ?? [])
		.filter((row) => row.status === 'accepted' || row.status === 'edited')
		.filter((row) => row.confidence === 'strong' || row.confidence === 'confirmed')
		.slice(0, 5);

	const editSlice = clip(acceptedEdits.map((row) => row.observation).join('\n'), 500);

	const sections = {
		identity,
		voice,
		guardrails,
		examples,
		strategy: strategySlice,
		theme: themeSlice,
		memory: memorySlice,
		learnings: learningSlice,
		editLearnings: editSlice,
	};

	const prompt = [
		'## Brand identity',
		identity,
		'',
		'## Voice (authoritative over generic anti-AI style rules)',
		voice,
		'',
		'## Guardrails',
		guardrails,
		examples ? `## Examples\n${examples}` : '',
		strategySlice ? `## Relevant strategy\n${strategySlice}` : '',
		themeSlice ? `## Theme\n${themeSlice}` : '',
		memorySlice ? `## Content memory\n${memorySlice}` : '',
		learningSlice ? `## Performance learnings (observational, not causal certainty)\n${learningSlice}` : '',
		editSlice ? `## Confirmed user preferences\n${editSlice}` : '',
	]
		.filter((block) => block.trim().length > 0)
		.join('\n');

	return { sections, prompt };
}
